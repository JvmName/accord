package dev.jvmname.accord.domain.control

import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.pointerInput
import dev.jvmname.accord.domain.Competitor
import dev.jvmname.accord.domain.control.ButtonEvent.SteadyState.SteadyStateError
import dev.zacsweers.metro.AppScope
import dev.zacsweers.metro.ContributesBinding
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
import kotlin.time.Clock
import kotlin.time.Duration
import kotlin.time.Duration.Companion.nanoseconds
import kotlin.time.Duration.Companion.seconds

sealed class ButtonEvent {
    data class SteadyState(val error: SteadyStateError?) :
        ButtonEvent() {
        enum class SteadyStateError { TwoButtonsPressed, PressTooShort }
    }

    data class Press(val competitor: Competitor) : ButtonEvent()
    data class Holding(val competitor: Competitor) : ButtonEvent()
    data class Release(val competitor: Competitor) : ButtonEvent()
}

interface ButtonPressTracker {
    val buttonEvents: StateFlow<ButtonEvent>
    fun recordPress(competitor: Competitor)
    fun recordRelease(competitor: Competitor)

}

@[ContributesBinding(AppScope::class) SingleIn(AppScope::class)]
class RealButtonPressTracker(
    private val coroutineScope: CoroutineScope,
    private val clock: Clock
) : ButtonPressTracker {
    private var activeCompetitor: Competitor? = null
    private var tracking: Job? = null
        set(value) {
            if (field != null && value != null) {
                System.err.println("Error - already running job")
            }
            field = value
        }
    private val _state = MutableStateFlow<ButtonEvent>(ButtonEvent.SteadyState(null))
    override val buttonEvents: StateFlow<ButtonEvent> get() = _state.asStateFlow()

    companion object {
        private val OneSecond = 1.seconds
    }

    override fun recordPress(competitor: Competitor) {
        println("BPT press $competitor")
        updateState(ButtonEvent.Press(competitor))
    }

    override fun recordRelease(competitor: Competitor) {
        println("BPT release $competitor")
        updateState(ButtonEvent.Release(competitor))
    }

    /*
      1. SteadyState → Clears tracking, activeCompetitor, and emits the event
      2. Press →
        - Valid (from SteadyState): Sets activeCompetitor, emits Press, launches ticker
        - Invalid (from Press/Holding):
            - Different competitor → Emit SteadyState(TwoButtonsPressed)
          - Same competitor → Ignored (UI flapping protection)
      3. Holding →
        - Valid (from Press/Holding): Emits event (time tracking handled by Someone Else)
        - Invalid → Ignored
      4. Release →
        - From Press → Emit SteadyState(PressTooShort)
        - From Holding → Emit SteadyState(null) - success!
        - From SteadyState → Defensive handling, emit SteadyState(null)
    */
    private fun updateState(incoming: ButtonEvent) {
        val previous = _state.value

        when (incoming) {
            is ButtonEvent.SteadyState -> _state.update { // Clear everything and emit
                tracking?.cancel()
                tracking = null
                activeCompetitor = null
                incoming
            }

            is ButtonEvent.Press -> when (previous) {
                is ButtonEvent.SteadyState -> _state.update { // Valid transition
                    activeCompetitor = incoming.competitor
                    tracking = coroutineScope.launch { // Launch ticker
                        ticker(OneSecond) {
                            val competitor = activeCompetitor!!
                            updateState(ButtonEvent.Holding(competitor = competitor))
                        }
                    }
                    incoming
                }

                is ButtonEvent.Press, is ButtonEvent.Holding -> {
                    // Check if same or different competitor
                    val currentCompetitor = when (previous) {
                        is ButtonEvent.Press -> previous.competitor
                        is ButtonEvent.Holding -> previous.competitor
                        else -> null
                    }
                    when (incoming.competitor) {
                        currentCompetitor -> _state.update { // Different competitor - error
                            tracking?.cancel()
                            tracking = null
                            activeCompetitor = null
                            ButtonEvent.SteadyState(SteadyStateError.TwoButtonsPressed)
                        }

                        else -> {
                            // Same competitor - ignore (UI flapping)
                            System.err.println("Error - Press/Holding but same competitor")
                        }
                    }
                }

                is ButtonEvent.Release -> Unit /* Invalid - ignore */
            }

            is ButtonEvent.Holding -> {
                // Validate competitor matches existing
                if (activeCompetitor != incoming.competitor) {
                    System.err.println("Error - Holding competitor mismatch: expected $activeCompetitor, got ${incoming.competitor}")
                    return
                }

                when (previous) {
                    is ButtonEvent.Press, is ButtonEvent.Holding -> _state.update { // Valid transition - emit
                        incoming
                    }

                    else -> Unit /* Invalid transition - ignore */
                }
            }

            is ButtonEvent.Release -> {
                // Ignore release from wrong competitor (e.g., after TwoButtonsPressed error)
                if (activeCompetitor != incoming.competitor) {
                    return
                }

                when (previous) {
                    is ButtonEvent.Press -> _state.update { // Too short
                        tracking?.cancel()
                        tracking = null
                        activeCompetitor = null
                        ButtonEvent.SteadyState(SteadyStateError.PressTooShort)
                    }

                    is ButtonEvent.Holding -> _state.update { // Valid release
                        tracking?.cancel()
                        tracking = null
                        activeCompetitor = null
                        ButtonEvent.SteadyState(null)
                    }

                    is ButtonEvent.SteadyState -> _state.update { // Defensive - already in steady state
                        tracking?.cancel()
                        tracking = null
                        activeCompetitor = null
                        ButtonEvent.SteadyState(null)
                    }

                    is ButtonEvent.Release -> Unit // Invalid - ignore
                }
            }
        }
    }

    private suspend fun ticker(updateFrequency: Duration, block: () -> Unit) {
        //borrowed from https://androidstudygroup.slack.com/archives/CJH03QASH/p1755194498759219?thread_ts=1755118236.503209&cid=CJH03QASH
        while (currentCoroutineContext().isActive) {
            val currentTime = clock.now()
            val rightOnTheDot = currentTime - currentTime.nanosecondsOfSecond.nanoseconds
            val delayTime = (rightOnTheDot + updateFrequency) - currentTime

            println("---")
            println("Current: $currentTime")
            println("Delay duration: $delayTime")
            println("---")

            block()
            delay(delayTime)
        }
    }

}

fun Modifier.buttonHold(
    onPress: () -> Unit,
    onRelease: () -> Unit
): Modifier =
    pointerInput(onPress, onRelease) {
        detectTapGestures(
            onPress = {
                onPress()
                tryAwaitRelease()
                onRelease()
            }
        )
    }
