package dev.jvmname.accord.domain.control

import dev.drewhamilton.poko.Poko
import dev.jvmname.accord.domain.control.BaseRound.Break
import dev.jvmname.accord.domain.control.BaseRound.Round
import dev.jvmname.accord.domain.control.RoundEvent.RoundState
import dev.zacsweers.metro.AppScope
import dev.zacsweers.metro.Assisted
import dev.zacsweers.metro.AssistedFactory
import dev.zacsweers.metro.AssistedInject
import dev.zacsweers.metro.SingleIn
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlin.time.Duration
import kotlin.time.Duration.Companion.milliseconds
import kotlin.time.Duration.Companion.minutes

@[AssistedInject]
class RoundTracker(
    private val scope: CoroutineScope,
    @Assisted
    private val config: RoundConfig,
) {
    private var roundNumber: Int = 1
    private var overallIndex: Int = 0
    private var pauseMutex = Mutex(false)
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
            state = RoundState.STARTED
        )
        runTimer(round)
    }

    fun pause() {
        val currentEvent = _roundEvent.value
        if (currentEvent != null) {
            _roundEvent.value = RoundEvent(
                remaining = currentEvent.remaining,
                roundNumber = currentEvent.roundNumber,
                totalRounds = currentEvent.totalRounds,
                state = RoundState.PAUSED
            )
        }
        scope.launch {
            pauseMutex.lock(this@RoundTracker)
        }
    }

    fun resume() {
        if (pauseMutex.isLocked) {
            pauseMutex.unlock(this)
        }
    }

    fun endRound() {
        timerJob?.cancel()
        timerJob = null

        val currentEvent = _roundEvent.value
        if (currentEvent != null) {
            _roundEvent.value = RoundEvent(
                remaining = currentEvent.remaining,
                roundNumber = currentEvent.roundNumber,
                totalRounds = totalRounds,
                state = RoundState.ENDED
            )
        }

        // Advance immediately to next round
        nextRound()
        if (overallIndex < config.rounds.size) {
            val round = config[overallIndex]
            _roundEvent.value = RoundEvent(
                remaining = round.duration,
                roundNumber = roundNumber,
                totalRounds = totalRounds,
                state = RoundState.STARTED
            )
            runTimer(round)
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
            _roundEvent.value = RoundEvent(
                remaining = Duration.ZERO,
                roundNumber = roundNumber,
                totalRounds = totalRounds,
                state = RoundState.ENDED
            )
        }
    }

    private fun runTimer(baseRound: BaseRound) {
        timerJob?.cancel()
        timerJob = scope.launch {
            ticker(500.milliseconds, baseRound.duration) { remaining ->
                _roundEvent.value = RoundEvent(
                    remaining = remaining,
                    roundNumber = roundNumber,
                    totalRounds = totalRounds,
                    state = RoundState.STARTED
                )
            }
        }
    }

    private suspend fun ticker(
        updateFreq: Duration,
        timeLimit: Duration,
        block: (Duration) -> Unit,
    ) {
        var remainingTime = timeLimit

        while (currentCoroutineContext().isActive && remainingTime.isPositive()) {
            pauseMutex.withLock(this@RoundTracker) {
                val delay = minOf(remainingTime, updateFreq)
                delay(delay)

                remainingTime -= delay
                block(remainingTime)
            }
        }
    }


    @[AssistedFactory SingleIn(AppScope::class)]
    fun interface Factory {
        operator fun invoke(config: RoundConfig): RoundTracker
    }

}

data class RoundConfig(val rounds: List<BaseRound>) {
    operator fun get(index: Int): BaseRound = rounds[index]

    companion object {
        val RdojoKombat = RoundConfig(
            listOf(
                Round(
                    index = 1,
                    maxPoints = 30,
                    duration = 3.minutes
                ),
                Break(1.minutes),
                Round(
                    index = 2,
                    maxPoints = 20,
                    duration = 2.minutes
                ),
                Break(1.minutes),
                Round(
                    index = 3,
                    maxPoints = 10,
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
    val state: RoundState,
) {
    enum class RoundState {
        STARTED, PAUSED, ENDED
    }

    fun remainingHumanTime(): String {
        val minutes = remaining.inWholeMinutes
        val seconds = remaining.inWholeSeconds % 60
        return "$minutes:${seconds.toString().padStart(2, '0')}"
    }
}