package dev.jvmname.accord.domain.control

import androidx.compose.runtime.Immutable
import androidx.compose.runtime.Stable
import dev.drewhamilton.poko.Poko
import dev.jvmname.accord.domain.control.ButtonEvent.SteadyState.SteadyStateError
import dev.jvmname.accord.domain.control.score.Score
import dev.jvmname.accord.ui.common.Consumable
import dev.zacsweers.metro.Assisted
import dev.zacsweers.metro.AssistedFactory
import dev.zacsweers.metro.AssistedInject
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.mapNotNull
import kotlinx.coroutines.flow.merge
import kotlinx.coroutines.flow.runningFold
import kotlinx.coroutines.launch
import top.ltfan.multihaptic.DelayType
import top.ltfan.multihaptic.HapticEffect
import kotlin.time.Duration.Companion.milliseconds

@AssistedInject
class ScoreHapticFeedbackHelper(
    @Assisted val buttonEvents: SharedFlow<ButtonEvent>,
    @Assisted val score: StateFlow<Score>,
    scope: CoroutineScope,
) {
    private val _hapticEvents = MutableSharedFlow<HapticEvent>()
    val hapticEvents: SharedFlow<HapticEvent> = _hapticEvents.asSharedFlow()

    @AssistedFactory
    fun interface Factory {
        fun create(
            buttonEvents: SharedFlow<ButtonEvent>,
            score: StateFlow<Score>,
        ): ScoreHapticFeedbackHelper
    }

    init {
        val buttonHapticTriggers: Flow<HapticTrigger> = buttonEvents
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

        val scoreHapticTriggers: Flow<HapticTrigger> = score
            .runningFold(score.value to null as HapticTrigger?) { (prev, _), current ->
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

        scope.launch {
            merge(buttonHapticTriggers, scoreHapticTriggers)
                .map { HapticEvent(Consumable(it.effect)) }
                .collect(_hapticEvents)
        }
    }
}

@Immutable
sealed interface HapticTrigger {
    val effect: HapticEffect

    data object ButtonPress : HapticTrigger {
        override val effect = HapticEffect {
            slowRise
        }
    }

    data object ButtonRelease : HapticTrigger {
        override val effect = HapticEffect {
            quickFall
        }
    }

    data object ButtonHolding : HapticTrigger {
        override val effect = HapticEffect {
            click
        }
    }

    data object ErrorTwoButtonsPressed : HapticTrigger {
        override val effect = HapticEffect {
            click
            click
            click
        }
    }

    data object ErrorPressTooShort : HapticTrigger {
        override val effect = HapticEffect {
            spin
        }
    }

    data object ScoreIncrement : HapticTrigger {
        override val effect = HapticEffect {
            click
            click{
                delay = 110.milliseconds
                delayType = DelayType.Pause
            }
        }
    }

    data object TechFallWin : HapticTrigger {
        override val effect = HapticEffect {
            click
            val ms = 50.milliseconds
            thud {
                delay = ms
                delayType = DelayType.Pause
            }
            spin {
                delay = ms
                delayType = DelayType.Pause
            }
            click {
                delay = ms
                delayType = DelayType.Pause
            }
            thud {
                delay = ms
                delayType = DelayType.Pause
            }
            spin {
                delay = ms
                delayType = DelayType.Pause
            }
        }
    }

    data object TimeExpired : HapticTrigger {
        override val effect = HapticEffect {
            thud
            spin {
                delay = 80.milliseconds
                delayType = DelayType.Pause
            }
        }
    }
}

@[Poko Stable]
class HapticEvent(val effect: Consumable<HapticEffect>)
