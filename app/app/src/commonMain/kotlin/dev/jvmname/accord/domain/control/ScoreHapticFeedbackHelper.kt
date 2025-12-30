package dev.jvmname.accord.domain.control

import androidx.compose.runtime.Immutable
import androidx.compose.runtime.Stable
import dev.drewhamilton.poko.Poko
import dev.jvmname.accord.domain.control.ButtonEvent.SteadyState.SteadyStateError
import dev.zacsweers.metro.Inject
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.mapNotNull
import kotlinx.coroutines.flow.merge
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.flow.runningFold
import top.ltfan.multihaptic.HapticEffect

@Inject
class ScoreHapticFeedbackHelper(
    buttonPressTracker: ButtonPressTracker,
    scoreKeeper: ScoreKeeper,
    scope: CoroutineScope
) {
    private val _hapticEvents = MutableSharedFlow<HapticEvent>()
    val hapticEvents: SharedFlow<HapticEvent> = _hapticEvents.asSharedFlow()

    init {
        val buttonHapticTriggers: Flow<HapticTrigger> = buttonPressTracker.buttonEvents
            .mapNotNull { event ->
                when (event) {
                    is ButtonEvent.Press -> HapticTrigger.ButtonPress
                    is ButtonEvent.Release -> HapticTrigger.ButtonRelease
                    is ButtonEvent.Holding -> HapticTrigger.ButtonHolding
                    is ButtonEvent.SteadyState -> when (event.error) {
                        SteadyStateError.TwoButtonsPressed -> HapticTrigger.ErrorTwoButtonsPressed
                        SteadyStateError.PressTooShort -> HapticTrigger.ErrorPressTooShort
                        null -> null
                    }
                }
            }

        val scoreHapticTriggers: Flow<HapticTrigger> = scoreKeeper.score
            .runningFold(scoreKeeper.score.value to null as HapticTrigger?) { (prev, _), current ->
                current to when {
                    // Check for technical superiority first (higher priority)
                    prev.techFallWin == null && current.techFallWin != null -> HapticTrigger.TechFallWin
                    // Check for score increment
                    current.redPoints > prev.redPoints -> HapticTrigger.ScoreIncrement
                    current.bluePoints > prev.bluePoints -> HapticTrigger.ScoreIncrement
                    else -> null
                }
            }
            .drop(1) // Skip initial emission (same score, null trigger)
            .mapNotNull { (_, trigger) -> trigger }

        merge(buttonHapticTriggers, scoreHapticTriggers)
            .onEach { _hapticEvents.emit(HapticEvent(Consumable(it.effect))) }
            .launchIn(scope)
    }
}

@Immutable
sealed interface HapticTrigger {
    val effect: HapticEffect

    data object ButtonPress : HapticTrigger {
        override val effect = HapticEffect {
            click {
            }

        }
    }

    data object ButtonRelease : HapticTrigger {
        override val effect = HapticEffect {
            click {
            }
        }
    }

    data object ButtonHolding : HapticTrigger {
        override val effect = HapticEffect {
            tick {
                scale = 0.75f
            }
        }
    }

    data object ErrorTwoButtonsPressed : HapticTrigger {
        override val effect = HapticEffect {
            click {
            }
        }
    }

    data object ErrorPressTooShort : HapticTrigger {
        override val effect = HapticEffect {
            click {
            }
        }
    }

    data object ScoreIncrement : HapticTrigger {
        override val effect = HapticEffect {
            click {
            }
        }
    }

    data object TechFallWin : HapticTrigger {
        override val effect = HapticEffect {
            click {
            }
        }
    }
}

@[Poko Stable]
class HapticEvent(val effect: Consumable<HapticEffect>) {
}

//a la SingleLiveEvent
@Stable
class Consumable<T>(private val value: T) {
    private var consumed = false

    fun consume(): T? = when {
        consumed -> null
        else -> {
            consumed = true
            value
        }
    }
}