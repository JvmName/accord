package dev.jvmname.accord.domain.control.rounds

import dev.jvmname.accord.di.MatchScope
import dev.jvmname.accord.domain.control.rounds.BaseRound.Round
import dev.zacsweers.metro.Inject
import dev.zacsweers.metro.SingleIn
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlin.concurrent.atomics.AtomicBoolean
import kotlin.time.Duration
import kotlin.time.Duration.Companion.milliseconds

@[Inject SingleIn(MatchScope::class)]
class SoloRoundTracker(
    private val scope: CoroutineScope,
    private val config: RoundConfig,
) : RoundTracker {
    private var roundNumber: Int = 1
    private var overallIndex: Int = 0
    private var isPaused = AtomicBoolean(false)
    private var timerJob: Job? = null

    private val totalRounds: Int = config.rounds.count { it is Round }

    private val _roundEvent = MutableStateFlow<RoundEvent?>(null)
    override val roundEvent: StateFlow<RoundEvent?> = _roundEvent.asStateFlow()


    override fun startRound() {
        // Advance to next round if not the first call
        if (_roundEvent.value != null) {
            nextRound()
        }

        if (overallIndex >= config.rounds.size) return

        val round = config[overallIndex]
        _roundEvent.value = RoundEvent(
            remaining = round.duration,
            roundNumber = roundNumber,
            totalRounds = totalRounds,
            round = round,
            state = RoundEvent.RoundState.STARTED
        )
        runTimer(round)
    }

    override fun pause() {
        isPaused.exchange(true)
        _roundEvent.update {
            it?.copy(state = RoundEvent.RoundState.PAUSED)
        }
    }

    override fun resume() {
        isPaused.store(false)
    }

    override fun endRound() {
        timerJob?.cancel()
        timerJob = null

        _roundEvent.update {
            it ?: return@update null
            RoundEvent(
                remaining = it.remaining,
                roundNumber = it.roundNumber,
                totalRounds = totalRounds,
                round = it.round,
                state = RoundEvent.RoundState.ENDED
            )
        }
    }

    private fun nextRound() {
        overallIndex++

        // Increment round number only for actual Rounds, not Breaks
        if (overallIndex < config.rounds.size && config[overallIndex] is Round) {
            roundNumber++
        }

        if (overallIndex >= config.rounds.size) {
            // No more rounds - emit final End event
            _roundEvent.update {
                RoundEvent(
                    remaining = Duration.Companion.ZERO,
                    roundNumber = roundNumber,
                    totalRounds = totalRounds,
                    round = it!!.round,
                    state = RoundEvent.RoundState.MATCH_ENDED
                )
            }
        }
    }

    private fun runTimer(baseRound: BaseRound) {
        timerJob?.cancel()
        timerJob = scope.launch {
            ticker(500.milliseconds, baseRound.duration) { remaining ->
                _roundEvent.update {
                    RoundEvent(
                        remaining = remaining,
                        roundNumber = roundNumber,
                        totalRounds = totalRounds,
                        round = config[overallIndex],
                        state = RoundEvent.RoundState.STARTED
                    )
                }
            }
            endRound()
        }
    }

    private suspend fun ticker(
        updateFreq: Duration,
        timeLimit: Duration,
        block: (Duration) -> Unit,
    ) {
        var remainingTime = timeLimit

        while (currentCoroutineContext().isActive && remainingTime.isPositive()) {
            // Wait while paused
            maybePauseTicker()

            val delayDuration = minOf(remainingTime, updateFreq)
            delay(delayDuration)

            maybePauseTicker()
            remainingTime -= delayDuration
            block(remainingTime)
        }
    }

    private suspend fun maybePauseTicker() {
        while (isPaused.load()) delay(100.milliseconds)
    }
}