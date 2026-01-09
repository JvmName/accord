package dev.jvmname.accord.domain.control

import accord.app.generated.resources.Res
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.Stable
import dev.drewhamilton.poko.Poko
import dev.jvmname.accord.di.MatchScope
import dev.jvmname.accord.domain.control.RoundEvent.RoundState
import dev.jvmname.accord.ui.common.Consumable
import dev.zacsweers.metro.Inject
import dev.zacsweers.metro.SingleIn
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.mapNotNull
import kotlinx.coroutines.launch

@[Inject SingleIn(MatchScope::class)]
class AudioFeedbackHelper(
    roundTracker: RoundTracker,
    scope: CoroutineScope,
) {
    private val _audioEvents = MutableSharedFlow<AudioEvent>()
    val audioEvents: SharedFlow<AudioEvent> = _audioEvents.asSharedFlow()

    init {
        scope.launch {
            roundTracker.roundEvent
                .mapNotNull { event ->
                    when (event?.state) {
                        RoundState.ENDED if event.round is BaseRound.Round -> AudioTrigger.RoundEnded
                        RoundState.MATCH_ENDED -> AudioTrigger.RoundEnded
                        else -> null
                    }
                }
                .collect { trigger ->
                    _audioEvents.emit(AudioEvent(Consumable(trigger.resource)))
                }
        }
    }
}

@Immutable
sealed interface AudioTrigger {
    val resource: String

    data object RoundEnded : AudioTrigger {
        override val resource = Res.getUri("files/beep.mp3")
    }
}

@[Poko Stable]
class AudioEvent(val resource: Consumable<String>)
