package dev.jvmname.accord.domain.control

import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import dev.drewhamilton.poko.Poko
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
                    is ButtonEvent.SteadyState -> {
                        when (event.error) {
                            ButtonEvent.SteadyState.SteadyStateError.TwoButtonsPressed ->
                                HapticTrigger.ErrorTwoButtonsPressed

                            ButtonEvent.SteadyState.SteadyStateError.PressTooShort ->
                                HapticTrigger.ErrorPressTooShort

                            null -> null
                        }
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
            .onEach { trigger -> _hapticEvents.emit(trigger.toHapticEvent()) }
            .launchIn(scope)
    }
}

/**
 * Represents the reason a haptic event should be triggered.
 */
enum class HapticTrigger {
    ButtonPress,
    ButtonRelease,
    ButtonHolding,
    ErrorTwoButtonsPressed,
    ErrorPressTooShort,
    ScoreIncrement,
    TechFallWin;

    fun toHapticEvent(): HapticEvent = when (this) {
        ButtonPress -> HapticEvent(HapticFeedbackType.LongPress) // TODO: Use proper haptic type
        ButtonRelease -> HapticEvent(HapticFeedbackType.LongPress) // TODO: Use proper haptic type
        ButtonHolding -> HapticEvent(HapticFeedbackType.LongPress) // TODO: Use proper haptic type
        ErrorTwoButtonsPressed -> HapticEvent(HapticFeedbackType.LongPress) // TODO: Use proper haptic type
        ErrorPressTooShort -> HapticEvent(HapticFeedbackType.LongPress) // TODO: Use proper haptic type
        ScoreIncrement -> HapticEvent(HapticFeedbackType.LongPress) // TODO: Use proper haptic type
        TechFallWin -> HapticEvent(HapticFeedbackType.LongPress) // TODO: Use proper haptic type
    }
}

@Poko
class HapticEvent(val event: HapticFeedbackType)