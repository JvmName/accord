package dev.jvmname.accord.domain

import co.touchlab.kermit.Logger
import com.github.michaelbull.result.Ok
import com.github.michaelbull.result.andThen
import com.github.michaelbull.result.flatMap
import com.github.michaelbull.result.onOk
import com.github.michaelbull.retry.policy.stopAtAttempts
import com.github.michaelbull.retry.retry
import dev.jvmname.accord.di.MatchScope
import dev.jvmname.accord.network.AccordClient
import dev.jvmname.accord.network.CompetitorColor
import dev.jvmname.accord.network.CompetitorRequest
import dev.jvmname.accord.network.Match
import dev.jvmname.accord.network.MatchId
import dev.jvmname.accord.network.NetworkResult
import dev.jvmname.accord.network.SocketClient
import dev.jvmname.accord.network.flatMapping
import dev.jvmname.accord.network.merge
import dev.jvmname.accord.prefs.Prefs
import dev.jvmname.accord.ui.catchRunning
import dev.zacsweers.metro.Inject
import dev.zacsweers.metro.SingleIn
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.launch
import kotlin.concurrent.atomics.AtomicReference

@[Inject SingleIn(MatchScope::class)]
class MatchManager(
    private val prefs: Prefs,
    private val client: AccordClient,
    private val socketFactory: SocketClient.Factory,
    private val scope: CoroutineScope,
    private val match: Match,
) {
    private val log = Logger.withTag("Domain/MatchManager")
    private var activeMatch = AtomicReference<Match?>(null)
    private lateinit var socket: SocketClient
    private var observationJob: Job? = null

    init {
        log.i { "MatchManager init matchId=${match.id}" }
        scope.launch {
            val token = requireNotNull(prefs.getAuthToken())
            socket = socketFactory.create(token)
            getMatch(match.id, false)
            cacheMatch(match)
            connectAndObserve(match)
        }
    }

    fun observeCurrentMatch(): Flow<Match?> = prefs.observeCurrentMatch()

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
            cacheMatch(match)
        }
    }

    suspend fun getMatch(matchId: MatchId, useCache: Boolean = true): NetworkResult<Match> =
        retry(stopAtAttempts(5)) {
            log.d { "getMatch matchId=$matchId" }
            // Check cache first if enabled
            if (useCache && activeMatch.load()?.id == matchId) return Ok(activeMatch.load()!!)
            return client.getMatch(matchId)
                .onOk { match -> cacheMatch(match) }
        }

    suspend fun startMatch(): NetworkResult<Match> {
        log.i { "starting match ${activeMatch.load()?.id}" }
        return catchRunning { activeMatch.load() }
            .flatMapping { match ->
                if (match == null) error("Must create match first")
                Ok(match)
            }
            .flatMap { client.startMatch(it.id) }
            .onOk { match ->
                cacheMatch(match)
                prefs.updateCurrentMatch(match)
                log.i { "match started" }
            }
    }

    suspend fun endMatch(): NetworkResult<Match> {
        log.i { "ending match ${activeMatch.load()?.id}" }
        return catchRunning { activeMatch.load() }
            .flatMapping { match ->
                if (match == null) error("Must create match first")
                Ok(match)
            }
            .flatMap { client.endMatch(it.id) }
            .onOk { match ->
                cacheMatch(match)
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
        return catchRunning { activeMatch.load() }
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
                val merged = activeMatch.load()?.let { match.merge(it) } ?: match
                cacheMatch(merged)
                updateCurrentMatchIfActive(merged)
            }
    }

    suspend fun endRound(
        matchId: MatchId,
        submission: String? = null,
        submitter: Competitor? = null
    ): NetworkResult<Match> {
        log.i { "ending round matchId=$matchId submission=$submission" }
        return client.endRound(matchId, submission, submitter?.asColor)
            .onOk { match ->
                val merged = activeMatch.load()?.let { match.merge(it) } ?: match
                cacheMatch(merged)
                updateCurrentMatchIfActive(merged)
            }
    }

    suspend fun pauseRound(matchId: MatchId): NetworkResult<Match> {
        return client.pauseRound(matchId)
            .onOk { match ->
                log.i { "round $matchId paused" }
                val merged = activeMatch.load()?.let { match.merge(it) } ?: match
                cacheMatch(merged)
                prefs.updateCurrentMatch(merged)
            }
    }

    suspend fun resumeRound(matchId: MatchId): NetworkResult<Match> {
        return client.resumeRound(matchId)
            .onOk { match ->
                log.i { "round $matchId resumed" }
                val merged = activeMatch.load()?.let { match.merge(it) } ?: match
                cacheMatch(merged)
                prefs.updateCurrentMatch(merged)
            }
    }

    suspend fun startRidingTimeVote(
        matchId: MatchId,
        competitor: CompetitorColor
    ): NetworkResult<Match> {
        log.d { "startVote competitor=$competitor round=$matchId" }
        return client.startRidingTimeVote(matchId, competitor)
            .onOk { match ->
                cacheMatch(activeMatch.load()?.let { match.merge(it) } ?: match)
                // Socket updates will handle prefs updates
            }
    }

    suspend fun endRidingTimeVote(
        matchId: MatchId,
        competitor: CompetitorColor
    ): NetworkResult<Match> {
        log.d { "endVote competitor=$competitor round=$matchId" }
        return client.endRidingTimeVote(matchId, competitor)
            .onOk { match ->
                cacheMatch(activeMatch.load()?.let { match.merge(it) } ?: match)
                // Socket updates will handle prefs updates
            }
    }


    private fun connectAndObserve(match: Match) {
        log.i { "observing match ${match.id} via socket" }
        socket.connect()
        observationJob?.cancel()
        observationJob = scope.launch {
            socket.observeMatch(match.id).collect { updatedMatch ->
                log.d { "cache updated matchId=${updatedMatch.id} rounds=${updatedMatch.rounds.size}" }
                val merged = activeMatch.load()?.let { updatedMatch.merge(it) } ?: updatedMatch
                cacheMatch(merged)
                prefs.updateCurrentMatch(merged)
            }
        }
    }

    private fun cacheMatch(match: Match) {
        activeMatch.store(match)
    }

    private suspend fun updateCurrentMatchIfActive(match: Match) {
        // Only update prefs if match is currently active (started but not ended)
        if (match.startedAt != null && match.endedAt == null) {
            prefs.updateCurrentMatch(match)
        }
    }
}
