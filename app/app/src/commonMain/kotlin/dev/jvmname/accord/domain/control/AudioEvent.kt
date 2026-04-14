package dev.jvmname.accord.domain.control

import androidx.compose.runtime.Immutable
import androidx.compose.runtime.Stable
import dev.drewhamilton.poko.Poko
import dev.jvmname.accord.ui.common.Consumable

@Immutable
enum class AudioTrigger(val filename: String) {
    /** Fired once when a scored round ends (time out, tech fall, or manual end). */
    RoundEnded("air-horn.wav"),

    /** Fired once when the round timer crosses below 10 seconds remaining. */
    TenSecondsWarning("clacker.wav"),

    /** Fired when break countdown crosses below 3, 2, or 1 second. */
    BreakCountdown("countdown.wav"),

    /** Fired when the break ends and the next round begins. */
    BreakCountdownGo("round-start.wav"),
}

@[Poko Stable]
class AudioEvent(val trigger: Consumable<AudioTrigger>)
