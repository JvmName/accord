package dev.jvmname.accord.domain.control

import dev.drewhamilton.poko.Poko
import dev.jvmname.accord.di.MatchScope
import dev.jvmname.accord.domain.control.BaseRound.Break
import dev.jvmname.accord.domain.control.BaseRound.Round
import dev.jvmname.accord.domain.control.RoundEvent.RoundState
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
import kotlin.time.Duration.Companion.minutes
import kotlin.time.Duration.Companion.seconds

@[Inject SingleIn(MatchScope::class)]
class RoundTracker(
    private val scope: CoroutineScope,
    private val config: RoundConfig,
) {
    private var roundNumber: Int = 1
    private var overallIndex: Int = 0
    private var isPaused = AtomicBoolean(false)
    private var timerJob: Job? = null

    private val totalRounds: Int = config.rounds.count { it is Round }

    private val _roundEvent = MutableStateFlow<RoundEvent?>(null)
    val roundEvent: StateFlow<RoundEvent?> = _roundEvent.asStateFlow()


    fun startRound() {
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
            state = RoundState.STARTED
        )
        runTimer(round)
    }

    fun pause() {
        isPaused.exchange(true)
        _roundEvent.update {
            it?.copy(state = RoundState.PAUSED)
        }
    }

    fun resume() {
        isPaused.store(false)
    }

    fun endRound() {
        timerJob?.cancel()
        timerJob = null

        _roundEvent.value?.let {
            _roundEvent.value = RoundEvent(
                remaining = it.remaining,
                roundNumber = it.roundNumber,
                totalRounds = totalRounds,
                round = it.round,
                state = RoundState.ENDED
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
                    remaining = Duration.ZERO,
                    roundNumber = roundNumber,
                    totalRounds = totalRounds,
                    round = it!!.round,
                    state = RoundState.MATCH_ENDED
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
                        state = RoundState.STARTED
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

data class RoundConfig(val rounds: List<BaseRound>) {
    operator fun get(index: Int): BaseRound = rounds[index]
    fun getRound(roundIndex: Int): Round? = rounds.firstNotNullOfOrNull { br ->
        (br as? Round)?.takeIf { it.index == roundIndex }
    }

    companion object {
        val RdojoKombat = RoundConfig(
            listOf(
                Round(
                    index = 1,
                    duration = 3.minutes,
                    maxPoints = 24,
                ),
                Break(1.minutes),
                Round(
                    index = 2,
                    maxPoints = 16,
                    duration = 2.minutes
                ),
                Break(1.minutes),
                Round(
                    index = 3,
                    maxPoints = 8,
                    duration = 1.minutes,
                    optional = true
                ),
            )
        )


    }
}

sealed interface BaseRound {
    val duration: Duration

    @Poko
    class Round(
        val index: Int,
        val maxPoints: Int,
        override val duration: Duration,
        val optional: Boolean = false,
    ) : BaseRound

    @Poko
    class Break(override val duration: Duration) : BaseRound
}

data class RoundEvent(
    val remaining: Duration,
    val roundNumber: Int,
    val totalRounds: Int,
    val round: BaseRound,
    val state: RoundState,
) {
    enum class RoundState {
        STARTED, PAUSED, ENDED, MATCH_ENDED
    }

    fun remainingHumanTime(): String {
        val minutes = remaining.inWholeMinutes
        val seconds = remaining.inWholeSeconds % 60
        return "$minutes:${seconds.toString().padStart(2, '0')}"
    }
}