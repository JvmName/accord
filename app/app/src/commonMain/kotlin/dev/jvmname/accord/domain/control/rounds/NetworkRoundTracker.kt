package dev.jvmname.accord.domain.control.rounds

import com.github.michaelbull.result.onFailure
import com.github.michaelbull.result.onSuccess
import dev.jvmname.accord.di.MatchScope
import dev.jvmname.accord.domain.MatchManager
import dev.jvmname.accord.domain.control.rounds.RoundEvent.RoundState
import dev.jvmname.accord.network.Match
import dev.jvmname.accord.network.MatchId
import dev.zacsweers.metro.Inject
import dev.zacsweers.metro.SingleIn
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlin.time.Duration
import kotlin.time.Duration.Companion.seconds

/**
 * Network-based round tracker that syncs with the backend API.
 * Unlike SoloRoundTracker, this doesn't use local timers - rounds are controlled via network calls.
 */
@[Inject SingleIn(MatchScope::class)]
class NetworkRoundTracker(
    private val scope: CoroutineScope,
    private val matchManager: MatchManager,
    private val matchId: MatchId,
) : RoundTracker {

    private val _roundEvent = MutableStateFlow<RoundEvent?>(null)
    override val roundEvent: StateFlow<RoundEvent?> = _roundEvent.asStateFlow()

    private var currentRoundNumber: Int = 0
    private var isPaused: Boolean = false

    init {
        // Observe match updates to sync round state
        scope.launch {
            matchManager.observeCurrentMatch().collect { match ->
                match?.let { updateRoundStateFromMatch(it) }
            }
        }
    }

    override fun startRound() {
        scope.launch {
            matchManager.startRound(matchId)
                .onSuccess { match ->
                    updateRoundStateFromMatch(match)
                }
                .onFailure { error ->
                    // Handle error (could emit error state)
                    // For now, just log it
                    println("Failed to start round: $error")
                }
        }
    }

    override fun pause() {
        // Pause is only local - doesn't sync to network
        isPaused = true
        _roundEvent.update {
            it?.copy(state = RoundEvent.RoundState.PAUSED)
        }
    }

    override fun resume() {
        // Resume is only local - doesn't sync to network
        isPaused = false
        _roundEvent.update {
            it?.copy(state = RoundEvent.RoundState.STARTED)
        }
    }

    override fun endRound() {
        scope.launch {
            matchManager.endRound(matchId)
                .onSuccess { match ->
                    updateRoundStateFromMatch(match)
                }
                .onFailure { error ->
                    println("Failed to end round: $error")
                }
        }
    }

    private fun updateRoundStateFromMatch(match: Match) {
        // Find the active round (started but not ended)
        val activeRound = match.rounds.lastOrNull { it.endedAt == null }

        if (activeRound != null) {
            currentRoundNumber = match.rounds.indexOf(activeRound) + 1
            val totalRounds = match.rounds.size

            // Calculate elapsed time from startedAt
            val elapsed = (System.currentTimeMillis() - activeRound.startedAt).seconds

            // For network rounds, we don't have a fixed duration, so remaining is always unknown
            // We can just show elapsed time or set remaining to zero
            val remaining = Duration.ZERO

            _roundEvent.value = RoundEvent(
                remaining = remaining,
                roundNumber = currentRoundNumber,
                totalRounds = totalRounds,
                round = BaseRound.Round(
                    index = currentRoundNumber,
                    maxPoints = 0, // Network rounds don't have max points concept
                    duration = elapsed,
                    optional = false
                ),
                state = if (isPaused) RoundState.PAUSED else RoundState.STARTED
            )
        } else if (match.endedAt != null) {
            // Match ended
            _roundEvent.update {
                it?.copy(state = RoundEvent.RoundState.MATCH_ENDED) ?: RoundEvent(
                    remaining = Duration.ZERO,
                    roundNumber = match.rounds.size,
                    totalRounds = match.rounds.size,
                    round = BaseRound.Round(
                        index = match.rounds.size,
                        maxPoints = 0,
                        duration = Duration.ZERO,
                        optional = false
                    ),
                    state = RoundState.MATCH_ENDED
                )
            }
        } else {
            // No active round, match not ended - waiting to start
            _roundEvent.value = null
        }
    }
}
