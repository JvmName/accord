package dev.jvmname.accord.domain.control.rounds

import dev.jvmname.accord.di.MatchScope
import dev.zacsweers.metro.ContributesBinding
import dev.zacsweers.metro.Inject
import dev.zacsweers.metro.SingleIn
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlin.concurrent.atomics.AtomicBoolean
import kotlin.time.Duration


interface Timer {
    val isPaused: Boolean
    val remaining: Duration

    fun start(duration: Duration, interval: Duration): StateFlow<Duration>
    fun pause()
    fun resume()
    fun cancel()


}

@[Inject SingleIn(MatchScope::class) ContributesBinding(MatchScope::class)]
class RealTimer(
    private val scope: CoroutineScope
) : Timer {
    private var timerJob: Job? = null

    private val _flow = MutableStateFlow(Duration.ZERO)
    private var _isPaused = AtomicBoolean(false)

    override val remaining: Duration get() = _flow.value

    override fun start(duration: Duration, interval: Duration): StateFlow<Duration> {
        timerJob?.cancel()
        _isPaused.store(false)
        ticker(duration, interval)
        return _flow.asStateFlow()
    }

    override val isPaused: Boolean get() = _isPaused.load()

    override fun pause() {
        _isPaused.exchange(true)
    }

    override fun resume() {
        _isPaused.exchange(false)
    }

    override fun cancel() {
        timerJob?.cancel()
    }

    private fun ticker(duration: Duration, interval: Duration) {
        timerJob = scope.launch(Dispatchers.Default) {
            var remaining = duration
            val pauseInterval = interval / 5
            flow {
                while (currentCoroutineContext().isActive && remaining > Duration.ZERO) {
                    maybePause(pauseInterval)

                    val delay = minOf(remaining, interval)
                    delay(interval)

                    maybePause(pauseInterval)
                    remaining -= delay
                    emit(remaining)
                }
                emit(Duration.ZERO)
            }
                .collect(_flow)
        }

    }

    private suspend fun maybePause(pauseInterval: Duration) {
        while (_isPaused.load()) delay(pauseInterval)
    }
}