package dev.jvmname.accord.domain.control

import co.touchlab.kermit.Logger
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
    private val log = Logger.withTag("Domain/AudioHelper")
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

        log.d { "detectTrigger: prev=${prev?.summary ?: "null"} → current=${current.summary}" }

        // Round ended: transition from Round to Break.
        // In the network path there is no intermediate ENDED state — the WebSocket delivers
        // the next match payload which already reflects the break, so Round(STARTED)→Break is
        // the only observable transition. Guard with prev.state !in endStates to avoid
        // double-firing if an ENDED state somehow is observed before the Break arrives.
        if (prev?.round is RoundInfo.Round
            && prev.state !in endStates
            && current.round is RoundInfo.Break
        ) {
            log.d { "→ RoundEnded (Round→Break transition, prev.state=${prev.state})" }
            return AudioTrigger.RoundEnded
        }

        // "Go" signal: break just transitioned into a new round starting.
        if ((prev == null || prev.round is RoundInfo.Break)
            && current.round is RoundInfo.Round
            && current.state == RoundState.STARTED
        ) {
            log.d { "→ RoundStart (Break→Round transition)" }
            return AudioTrigger.RoundStart
        }

        return when (current.round) {
            is RoundInfo.Round -> detectRoundTrigger(prev, current)
            is RoundInfo.Break -> detectBreakTrigger(prev, current)
        }
    }

    private fun detectRoundTrigger(prev: RoundEvent?, current: RoundEvent): AudioTrigger? {
        // Guard: prev == null means first emission after subscription.
        // Without this, opening the app to an already-ended match fires RoundEnded spuriously.
        if (prev == null) {
            log.d { "detectRoundTrigger: prev==null, skipping first emission" }
            return null
        }

        // Round ended (manual, timer, or tech fall — including MATCH_ENDED)
        if (prev.state !in endStates && current.state in endStates) {
            log.d { "→ RoundEnded (state ${prev.state}→${current.state})" }
            return AudioTrigger.RoundEnded
        }

        // 10-second warning: only fire when crossing the threshold while actively running
        if (current.state == RoundState.STARTED
            && prev.remaining > 10.seconds
            && current.remaining <= 10.seconds
        ) {
            log.d { "→ TenSecondsWarning (remaining ${prev.remaining}→${current.remaining})" }
            return AudioTrigger.TenSecondsWarning
        }

        log.d { "detectRoundTrigger: no trigger (state=${current.state}, prev.remaining=${prev.remaining}, remaining=${current.remaining})" }
        return null
    }

    private fun detectBreakTrigger(prev: RoundEvent?, current: RoundEvent): AudioTrigger? {
        if (current.state != RoundState.STARTED || prev == null) {
            log.d { "detectBreakTrigger: skipping (state=${current.state}, prev==null=${prev == null})" }
            return null
        }
        // With 250-500 ms ticks, crossing two thresholds in one tick is possible under heavy load
        // but rare — acceptable UX since all three use the same sound.
        val range = current.remaining..<prev.remaining
        val crossed = (1..3).filter { it.seconds in range }
        return when {
            crossed.isNotEmpty() -> {
                log.d { "→ BreakCountdown (crossed ${crossed}s threshold: ${prev.remaining}→${current.remaining})" }
                AudioTrigger.BreakCountdown
            }
            else -> {
                log.d { "detectBreakTrigger: no trigger (remaining ${prev.remaining}→${current.remaining})" }
                null
            }
        }
    }

    private val RoundEvent.summary: String
        get() = "${round::class.simpleName}(#$roundNumber state=$state remaining=$remaining)"

    companion object {
        private val endStates = hashSetOf(RoundState.ENDED, RoundState.MATCH_ENDED)
    }
}
