package dev.jvmname.accord.domain

import com.github.michaelbull.result.Ok
import com.github.michaelbull.result.andThen
import com.github.michaelbull.result.flatMap
import com.github.michaelbull.result.onSuccess
import dev.jvmname.accord.di.MatchScope
import dev.jvmname.accord.network.AccordClient
import dev.jvmname.accord.network.CompetitorColor
import dev.jvmname.accord.network.Match
import dev.jvmname.accord.network.MatchId
import dev.jvmname.accord.network.NetworkResult
import dev.jvmname.accord.network.SocketClient
import dev.jvmname.accord.network.UserId
import dev.jvmname.accord.network.flatMapping
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
) {
    private var activeMatch = AtomicReference<Match?>(null)
    private lateinit var socket: SocketClient
    private var observationJob: Job? = null

    init {
        scope.launch {
            val token = requireNotNull(prefs.getAuthToken())
            socket = socketFactory.create(token)
        }
    }


    suspend fun createMatch(
        matCode: String,
        redCompetitorId: UserId,
        blueCompetitorId: UserId
    ): NetworkResult<Match> {
        return client.createMatch(matCode, redCompetitorId, blueCompetitorId)
            .onSuccess { match ->
                cacheMatch(match)
                socket.connect()
                // Subscribe to match updates and pipe them into prefs
                observationJob?.cancel()
                observationJob = scope.launch {
                    socket.observeMatch(match.id).collect { updatedMatch ->
                        cacheMatch(updatedMatch)
                        prefs.updateCurrentMatch(updatedMatch)
                    }
                }
            }
    }

    suspend fun getMatch(matchId: MatchId, useCache: Boolean = true): NetworkResult<Match> {
        // Check cache first if enabled
        if (useCache && activeMatch.load()?.id == matchId) return Ok(activeMatch.load()!!)
        return client.getMatch(matchId)
            .onSuccess { match ->
                cacheMatch(match)
            }
    }

    suspend fun startMatch(): NetworkResult<Match> {
        return catchRunning { activeMatch.load() }
            .flatMapping { match ->
                if (match == null) error("Must create match first")
                Ok(match)
            }
            .flatMap { client.startMatch(it.id) }
            .onSuccess { match ->
                cacheMatch(match)
                prefs.updateCurrentMatch(match)
            }
    }

    suspend fun endMatch(): NetworkResult<Match> {
        return catchRunning { activeMatch.load() }
            .flatMapping { match ->
                if (match == null) error("Must create match first")
                Ok(match)
            }
            .flatMap { client.endMatch(it.id) }
            .onSuccess { match ->
                cacheMatch(match)
                // Clear current match from prefs since match ended
                prefs.updateCurrentMatch(null)
                // Stop observing match updates
                observationJob?.cancel()
                observationJob = null
                socket.disconnect()
            }
    }

    suspend fun startRound(): NetworkResult<Match> {
        return catchRunning { activeMatch.load() }
            .flatMapping { match ->
                when (match?.startedAt) {
                    null -> {
                        val matchId = match?.id ?: error("Match null -- must create match first")
                        client.startMatch(matchId)
                    }

                    else -> Ok(match)
                }
            }
            .andThen { client.startRound(it.id) }
            .onSuccess { match ->
                cacheMatch(match)
                // Update current match since rounds changed
                updateCurrentMatchIfActive(match)
            }
    }

    suspend fun endRound(
        matchId: MatchId,
        submission: String? = null,
        submitter: CompetitorColor? = null
    ): NetworkResult<Match> {
        return client.endRound(matchId, submission, submitter)
            .onSuccess { match ->
                cacheMatch(match)
                updateCurrentMatchIfActive(match)
            }
    }

    suspend fun startRidingTimeVote(
        matchId: MatchId,
        competitor: CompetitorColor
    ): NetworkResult<Match> {
        return client.startRidingTimeVote(matchId, competitor)
            .onSuccess { match ->
                cacheMatch(match)
                // Socket updates will handle prefs updates
            }
    }

    suspend fun endRidingTimeVote(
        matchId: MatchId,
        competitor: CompetitorColor
    ): NetworkResult<Match> {
        return client.endRidingTimeVote(matchId, competitor)
            .onSuccess { match ->
                cacheMatch(match)
                // Socket updates will handle prefs updates
            }
    }

    fun observeCurrentMatch(): Flow<Match?> = prefs.observeCurrentMatch()

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
