package dev.jvmname.accord.domain.control.rounds

import com.github.michaelbull.result.onFailure
import com.github.michaelbull.result.onSuccess
import dev.jvmname.accord.di.ForControlType
import dev.jvmname.accord.di.MatchScope
import dev.jvmname.accord.domain.MatchManager
import dev.jvmname.accord.domain.control.rounds.RoundEvent.RoundState
import dev.jvmname.accord.network.Match
import dev.jvmname.accord.network.MatchId
import dev.jvmname.accord.ui.control.ControlTimeType
import dev.zacsweers.metro.ContributesBinding
import dev.zacsweers.metro.Inject
import dev.zacsweers.metro.SingleIn
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.dropWhile
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlin.time.Duration
import kotlin.time.Duration.Companion.milliseconds

/**
 * Network-based round tracker that syncs with the backend API.
 */
@Inject
@SingleIn(MatchScope::class)
@ContributesBinding(MatchScope::class)
@ForControlType(ControlTimeType.CONSENSUS)
class NetworkRoundTracker(
    private val scope: CoroutineScope,
    private val matchManager: MatchManager,
    matchId: MatchId?,
    private val timer: Timer,
) : RoundTracker {

    private val matchId = requireNotNull(matchId) { "matchId cannot be null!" }

    private val _roundEvent = MutableStateFlow<RoundEvent?>(null)
    override val roundEvent: StateFlow<RoundEvent?> = _roundEvent.asStateFlow()

    private var currentRoundNumber: Int = 0

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
            matchManager.startRound()
                .onSuccess { match ->
                    updateRoundStateFromMatch(match)
                    runTimer(match)
                }
                .onFailure { error ->
                    // Handle error (could emit error state)
                    // For now, just log it
                    println("Failed to start round: $error")
                }
        }
    }

    override fun pause() {
        timer.pause()
        _roundEvent.update {
            it?.copy(state = RoundEvent.RoundState.PAUSED)
        }
    }

    override fun resume() {
        timer.resume()
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
        val activeRound = match.rounds.firstOrNull { it.endedAt == null }

        if (activeRound != null) {
            currentRoundNumber = activeRound.index
            val totalRounds = match.rounds.size
            val config = MatchConfig.RdojoKombat.getRound(currentRoundNumber)

            _roundEvent.value = RoundEvent(
                remaining = timer.remaining,
                roundNumber = currentRoundNumber,
                totalRounds = totalRounds,
                round = RoundInfo.Round(
                    index = currentRoundNumber,
                    maxPoints = config!!.maxPoints,
                    duration = config!!.duration,
                    optional = false
                ),
                state = if (timer.isPaused) RoundState.PAUSED else RoundState.STARTED
            )
        } else if (match.endedAt != null) {
            // Match ended
            _roundEvent.update {
                it?.copy(state = RoundEvent.RoundState.MATCH_ENDED) ?: RoundEvent(
                    remaining = Duration.ZERO,
                    roundNumber = match.rounds.size,
                    totalRounds = match.rounds.size,
                    round = RoundInfo.Round(
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

    private fun runTimer(match: Match) {
        val totalRounds = match.rounds.size
        val currentRound = match.rounds[currentRoundNumber] //Todo eventually use this
        val roundInfo = MatchConfig.RdojoKombat.getRound(currentRoundNumber)
        scope.launch {
            timer.start(roundInfo!!.duration, 500.milliseconds)
                .dropWhile { it == Duration.ZERO }
                .collect { remaining ->
                    when (remaining) {
                        Duration.ZERO -> {
                            endRound()
                            startRound()
                        }

                        else -> {
                            _roundEvent.update {
                                RoundEvent(
                                    remaining = remaining,
                                    roundNumber = currentRoundNumber,
                                    totalRounds = totalRounds,
                                    round = roundInfo!!,
                                    state = RoundEvent.RoundState.STARTED
                                )
                            }
                        }
                    }
                }
        }
    }
}
