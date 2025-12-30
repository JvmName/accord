package dev.jvmname.accord.domain.control

import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.waitForUpOrCancellation
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
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlin.concurrent.atomics.AtomicReference
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
    val buttonEvents: SharedFlow<ButtonEvent>
    fun recordPress(competitor: Competitor)
    fun recordRelease(competitor: Competitor)

}

@[ContributesBinding(AppScope::class) SingleIn(AppScope::class)]
class RealButtonPressTracker(
    private val coroutineScope: CoroutineScope,
    private val clock: Clock
) : ButtonPressTracker {
    private var tracking: Job? = null
        set(value) {
            if (field != null && value != null) {
                System.err.println("Error - already running job")
            }
            field = value
        }

    // Internal state for state machine logic
    private val _state = AtomicReference<ButtonEvent>(ButtonEvent.SteadyState(null))

    // External events (no deduplication)
    private val _events = MutableSharedFlow<ButtonEvent>(replay = 0)
    override val buttonEvents: SharedFlow<ButtonEvent> get() = _events.asSharedFlow()

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
      1. SteadyState → Clears tracking and emits the event
      2. Press →
        - Valid (from SteadyState): Emits Press, launches ticker
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
        val previous = _state.load()

        when (incoming) {
            is ButtonEvent.SteadyState -> {
                tracking?.cancel()
                tracking = null
                _state.store(incoming.also {
                    println("SteadyState! ButtonPress State -> $it")
                })
                coroutineScope.launch { _events.emit(incoming) }
            }

            is ButtonEvent.Press -> when (previous) {
                is ButtonEvent.SteadyState -> {
                    val competitor = incoming.competitor
                    tracking = coroutineScope.launch { // Launch ticker
                        ticker(OneSecond) {
                            updateState(ButtonEvent.Holding(competitor = competitor))
                        }
                    }
                    _state.store(incoming)
                    coroutineScope.launch { _events.emit(incoming) }
                }

                is ButtonEvent.Press, is ButtonEvent.Holding -> {
                    // Check if same or different competitor
                    val currentCompetitor = previous.competitor
                    when (incoming.competitor) {
                        currentCompetitor -> {
                            // Same competitor - ignore (UI flapping)
                            System.err.println("Error - Press/Holding but same competitor")
                        }

                        else -> {
                            val errorState = ButtonEvent.SteadyState(SteadyStateError.TwoButtonsPressed)
                            tracking?.cancel()
                            tracking = null
                            _state.store(errorState.also {
                                println("Pressing! ButtonPress State -> $it")
                            })
                            coroutineScope.launch { _events.emit(errorState) }
                        }
                    }
                }

                is ButtonEvent.Release -> Unit /* Invalid - ignore */
            }

            is ButtonEvent.Holding -> {
                // Validate competitor matches existing
                if (previous.competitor != incoming.competitor) {
                    System.err.println("Error - Holding competitor mismatch: expected ${previous.competitor}, got ${incoming.competitor}")
                    return
                }

                when (previous) {
                    is ButtonEvent.Press, is ButtonEvent.Holding -> {
                        _state.store(incoming.also {
                            println("Holding! ButtonPress State -> $it")
                        })
                        coroutineScope.launch { _events.emit(incoming) }
                    }

                    else -> Unit /* Invalid transition - ignore */
                }
            }

            is ButtonEvent.Release -> {
                // Ignore release from wrong competitor (e.g., after TwoButtonsPressed error)
                if (previous.competitor != incoming.competitor) {
                    println("Error - Release competitor mismatch: expected ${previous.competitor}, got ${incoming.competitor}")
                    return
                }

                when (previous) {
                    is ButtonEvent.Press -> {
                        val errorState = ButtonEvent.SteadyState(SteadyStateError.PressTooShort)
                        tracking?.cancel()
                        tracking = null
                        _state.store(errorState.also {
                            println("Releasing! ButtonPress State -> $it")
                        })
                        coroutineScope.launch { _events.emit(errorState) }
                    }

                    is ButtonEvent.Holding -> {
                        val steadyState = ButtonEvent.SteadyState(null)
                        tracking?.cancel()
                        tracking = null
                        _state.store(steadyState.also {
                            println("Releasing! ButtonPress State -> $it")
                        })
                        coroutineScope.launch { _events.emit(steadyState) }
                    }

                    is ButtonEvent.SteadyState -> {
                        val steadyState = ButtonEvent.SteadyState(null)
                        tracking?.cancel()
                        tracking = null
                        _state.store(steadyState.also {
                            println("Releasing! ButtonPress State -> $it")
                        })
                        coroutineScope.launch { _events.emit(steadyState) }
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
): Modifier = pointerInput(onPress, onRelease) {
    awaitEachGesture {
        awaitFirstDown(requireUnconsumed = false).also {
            onPress()
            it.consume()
        }
        waitForUpOrCancellation()?.also {
            it.consume()
            onRelease()
        }
    }
}


private val ButtonEvent.competitor: Competitor?
    get() = when (this) {
        is ButtonEvent.Press -> competitor
        is ButtonEvent.Holding -> competitor
        is ButtonEvent.Release -> competitor
        else -> null
    }
