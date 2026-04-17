package dev.jvmname.accord.domain.control

import androidx.compose.runtime.Immutable
import androidx.compose.runtime.Stable
import dev.drewhamilton.poko.Poko
import dev.jvmname.accord.ui.common.Consumable
import kotlin.time.Duration
import kotlin.time.Duration.Companion.seconds

@Immutable
enum class AudioTrigger(val filename: String, val length: Duration) {
    /** Fired once when a scored round ends (time out, tech fall, or manual end). */
    RoundEnded("air-horn.wav", 1.2.seconds),

    /** Fired once when the round timer crosses below 10 seconds remaining. */
    TenSecondsWarning("clacker.wav", 1.2.seconds),

    /** Fired when break countdown crosses below 3, 2, or 1 second. */
    BreakCountdown("countdown.wav", 1.2.seconds),

    /** Fired when the break ends and the next round begins. */
    RoundStart("round-start.wav", 2.1.seconds),
}

@[Poko Stable]
class AudioEvent(val trigger: Consumable<AudioTrigger>)
