package dev.jvmname.accord.domain.control

import dev.jvmname.accord.domain.control.rounds.RoundEvent
import dev.jvmname.accord.domain.control.rounds.RoundEvent.RoundState
import dev.jvmname.accord.domain.control.rounds.RoundInfo
import dev.jvmname.accord.ui.common.Consumable
import dev.zacsweers.metro.Assisted
import dev.zacsweers.metro.AssistedFactory
import dev.zacsweers.metro.AssistedInject
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.flow.mapNotNull
import kotlinx.coroutines.flow.runningFold
import kotlinx.coroutines.launch
import kotlin.time.Duration.Companion.seconds

@AssistedInject
class RoundAudioFeedbackHelper(
    @Assisted private val roundEvent: StateFlow<RoundEvent?>,
    private val scope: CoroutineScope,
) {
    private val _audioEvents = MutableSharedFlow<AudioEvent>()
    val audioEvents: SharedFlow<AudioEvent> = _audioEvents.asSharedFlow()

    @AssistedFactory
    fun interface Factory {
        fun create(roundEvent: StateFlow<RoundEvent?>): RoundAudioFeedbackHelper
    }

    init {
        scope.launch {
            roundEvent
                .runningFold(null as RoundEvent? to null as RoundEvent?) { (_, prev), current ->
                    prev to current
                }
                .drop(1) // skip initial (null, null) pair
                .mapNotNull { (prev, current) -> detectTrigger(prev, current) }
                .collect { trigger -> _audioEvents.emit(AudioEvent(Consumable(trigger))) }
        }
    }

    private fun detectTrigger(prev: RoundEvent?, current: RoundEvent?): AudioTrigger? {
        current ?: return null

        // "Go" signal: break just transitioned into a new round starting.
        // Checked before the when branch because current.round is already a Round here.
        if (prev?.round is RoundInfo.Break
            && current.round is RoundInfo.Round
            && current.state == RoundState.STARTED
        ) return AudioTrigger.BreakCountdownGo

        return when (current.round) {
            is RoundInfo.Round -> detectRoundTrigger(prev, current)
            is RoundInfo.Break -> detectBreakTrigger(prev, current)
        }
    }

    private fun detectRoundTrigger(prev: RoundEvent?, current: RoundEvent): AudioTrigger? {
        // Guard: prev == null means first emission after subscription.
        // Without this, opening the app to an already-ended match fires RoundEnded spuriously.
        if (prev == null) return null

        // Round ended (manual, timer, or tech fall)
        if (prev.state !in endStates
            && current.state in endStates
        ) return AudioTrigger.RoundEnded

        // 10-second warning: only fire when crossing the threshold while actively running
        if (current.state == RoundState.STARTED
            && prev.remaining > 10.seconds
            && current.remaining <= 10.seconds
        ) return AudioTrigger.TenSecondsWarning

        return null
    }

    private fun detectBreakTrigger(prev: RoundEvent?, current: RoundEvent): AudioTrigger? {
        if (current.state != RoundState.STARTED || prev == null) return null
        // With 250-300 ms ticks, crossing two thresholds in one tick is possible under heavy load
        // but rare — acceptable UX since all three use the same sound.
        return when {
            (1..3).any { it.seconds in current.remaining..<prev.remaining } -> AudioTrigger.BreakCountdown
            else -> null
        }
    }

    companion object{
        private val endStates = hashSetOf(RoundState.ENDED, RoundState.MATCH_ENDED)
    }
}
