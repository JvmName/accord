package dev.jvmname.accord.domain.session

import dev.jvmname.accord.domain.Competitor
import dev.jvmname.accord.domain.control.ButtonEvent
import dev.jvmname.accord.domain.control.ButtonPressTracker
import dev.jvmname.accord.domain.control.rounds.Timer
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlin.time.Duration

class FakeButtonPressTracker : ButtonPressTracker {
    private val _events = MutableSharedFlow<ButtonEvent>(replay = 0)
    override val buttonEvents: SharedFlow<ButtonEvent> = _events.asSharedFlow()
    override fun recordPress(competitor: Competitor) {}
    override fun recordRelease(competitor: Competitor) {}
    suspend fun emit(event: ButtonEvent) = _events.emit(event)
}

class FakeTimer : Timer {
    private val _flow = MutableStateFlow(Duration.ZERO)
    override val isPaused: Boolean = false
    override val remaining: Duration get() = _flow.value
    override fun start(duration: Duration, interval: Duration): StateFlow<Duration> = _flow.asStateFlow()
    override fun pause() {}
    override fun resume() {}
    override fun cancel() { _flow.value = Duration.ZERO }
    suspend fun tick(remaining: Duration) { _flow.value = remaining }
}
