package dev.jvmname.accord.domain

import co.touchlab.kermit.Logger
import com.github.michaelbull.result.Ok
import com.github.michaelbull.result.andThen
import com.github.michaelbull.result.flatMap
import com.github.michaelbull.result.onOk
import com.github.michaelbull.retry.policy.stopAtAttempts
import com.github.michaelbull.retry.retry
import dev.jvmname.accord.di.MatchScope
import dev.jvmname.accord.network.*
import dev.jvmname.accord.prefs.Prefs
import dev.jvmname.accord.ui.catchRunning
import dev.zacsweers.metro.Inject
import dev.zacsweers.metro.SingleIn
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

@[Inject SingleIn(MatchScope::class)]
class MatchManager(
    private val prefs: Prefs,
    private val client: AccordClient,
    private val socketFactory: SocketClient.Factory,
    private val scope: CoroutineScope,
    private val match: Match,
) {
    private val log = Logger.withTag("Domain/MatchManager")
    private val _currentMatch = MutableStateFlow<Match?>(match)
    private lateinit var socket: SocketClient
    private var observationJob: Job? = null

    init {
        log.i { "MatchManager init matchId=${match.id}" }
        scope.launch {
            val token = requireNotNull(prefs.getAuthToken())
            socket = socketFactory.create(token)
            getMatch(match.id, false)
            updateCache(match)
            connectAndObserve(match)
        }
    }

    fun observeCurrentMatch(): Flow<Match?> = _currentMatch.asStateFlow()

    suspend fun createMatch(
        matCode: String,
        redCompetitor: String,
        blueCompetitor: String,
    ): NetworkResult<Match> {
        log.d { "createMatch matCode=$matCode" }
        return client.createMatch(
            matCode = matCode,
            redCompetitor = CompetitorRequest(name = redCompetitor),
            blueCompetitor = CompetitorRequest(name = blueCompetitor)
        ).onOk { match ->
            log.i { "match created id=${match.id}" }
            updateCache(match)
        }
    }

    suspend fun getMatch(matchId: MatchId, useCache: Boolean = true): NetworkResult<Match> =
        retry(stopAtAttempts(5)) {
            log.d { "getMatch matchId=$matchId" }
            // Check cache first if enabled
            if (useCache && _currentMatch.value?.id == matchId) return Ok(_currentMatch.value!!)
            return client.getMatch(matchId)
                .onOk { match -> updateCache(match) }
        }

    suspend fun startMatch(): NetworkResult<Match> {
        log.i { "starting match ${_currentMatch.value?.id}" }
        return catchRunning { _currentMatch.value }
            .flatMapping { match ->
                if (match == null) error("Must create match first")
                Ok(match)
            }
            .flatMap { client.startMatch(it.id) }
            .onOk { match ->
                updateCache(match)
                prefs.updateCurrentMatch(match)
                log.i { "match started" }
            }
    }

    suspend fun endMatch(): NetworkResult<Match> {
        log.i { "ending match ${_currentMatch.value?.id}" }
        return catchRunning { _currentMatch.value }
            .flatMapping { match ->
                if (match == null) error("Must create match first")
                Ok(match)
            }
            .flatMap { client.endMatch(it.id) }
            .onOk { match ->
                updateCache(match)
                // Clear current match from prefs since match ended
                prefs.updateCurrentMatch(null)
                // Stop observing match updates
                observationJob?.cancel()
                observationJob = null
                socket.disconnect()
                log.i { "match ended, cache cleared" }
            }
    }

    suspend fun startRound(): NetworkResult<Match> {
        return catchRunning { _currentMatch.value }
            .flatMapping { match ->
                when (match?.startedAt) {
                    null -> {
                        val matchId = match?.id ?: error("Match null -- must create match first")
                        log.i { "starting round matchId=$matchId (autoStartedMatch=true)" }
                        client.startMatch(matchId)
                    }

                    else -> {
                        log.i { "starting round matchId=${match.id}" }
                        Ok(match)
                    }
                }
            }
            .andThen { client.startRound(it.id) }
            .onOk { match ->
                updateCache(match)
            }
    }

    suspend fun endRound(
        matchId: MatchId,
        submission: String? = null,
        submitter: Competitor? = null,
        stoppage: Boolean = false,
        stopper: Competitor? = null,
    ): NetworkResult<Match> {
        log.i { "ending round matchId=$matchId submission=$submission stoppage=$stoppage" }
        return client.endRound(matchId, submission, submitter?.asColor, stoppage, stopper?.asColor)
            .onOk { match ->
                updateCache(match)
            }
    }

    suspend fun pauseRound(matchId: MatchId): NetworkResult<Match> {
        return client.pauseRound(matchId)
            .onOk { match ->
                log.i { "round $matchId paused" }
                updateCache(match)
            }
    }

    suspend fun resumeRound(matchId: MatchId): NetworkResult<Match> {
        return client.resumeRound(matchId)
            .onOk { match ->
                log.i { "round $matchId resumed" }
                updateCache(match)
            }
    }

    suspend fun startRidingTimeVote(
        matchId: MatchId,
        competitor: CompetitorColor
    ): NetworkResult<Match> {
        log.d { "startVote competitor=$competitor round=$matchId" }
        return client.startRidingTimeVote(matchId, competitor)
            .onOk { match -> updateCache(match) }
    }

    suspend fun endRidingTimeVote(
        matchId: MatchId,
        competitor: CompetitorColor
    ): NetworkResult<Match> {
        log.d { "endVote competitor=$competitor round=$matchId" }
        return client.endRidingTimeVote(matchId, competitor)
            .onOk { match -> updateCache(match) }
    }

    private fun connectAndObserve(match: Match) {
        log.i { "observing match ${match.id} via socket" }
        socket.connect()
        observationJob?.cancel()
        observationJob = scope.launch {
            socket.observeMatch(match.id)
                .collect {
                    log.d { "cache updated matchId=${it.id} rounds=${it.rounds.size}" }
                    updateCache(it)
                }

        }
    }

    private fun updateCache(match: Match) {
        _currentMatch.update { curr ->
            curr?.let { match.merge(curr) } ?: match
        }
    }
}
