package dev.jvmname.accord.ui.common

import accord.shared.generated.resources.Res
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.util.fastMap
import app.lexilabs.basic.sound.SoundBoard
import app.lexilabs.basic.sound.SoundByte
import app.lexilabs.basic.sound.play
import dev.jvmname.accord.di.LocalPlatformContext
import dev.jvmname.accord.domain.control.AudioEvent
import dev.jvmname.accord.domain.control.AudioTrigger

// Maps each trigger to a stable name used as the SoundByte key and mixer lookup.

// Maps each trigger to the Compose Resource URI. Res.getUri() is suspend.
private fun AudioTrigger.localPath(): String = when (this) {
    AudioTrigger.RoundEnded -> Res.getUri("files/${filename}")
    AudioTrigger.TenSecondsWarning -> Res.getUri("files/${filename}")
    AudioTrigger.BreakCountdown -> Res.getUri("files/${filename}")
    AudioTrigger.RoundStart -> Res.getUri("files/${filename}")
}

@Composable
fun AudioPlayback(event: AudioEvent?) {
    val context = LocalPlatformContext.current
    val soundBoard = remember { SoundBoard(context = context) }

    // Populate soundBytes and start the playback coroutine once.
    // powerUp() loads audio lazily when a name arrives — no async load race.
    LaunchedEffect(Unit) {
        soundBoard.soundBytes.addAll(
            AudioTrigger.entries.fastMap { trigger ->
                SoundByte(trigger.name, trigger.localPath())
            }
        )

        soundBoard.powerUp()
    }

    DisposableEffect(Unit) {
        onDispose { soundBoard.powerDown() }
    }

    // Re-runs only when a new AudioEvent object arrives (identity change).
    // consume() prevents double-firing if recomposition races.
    LaunchedEffect(event) {
        val trigger = event?.trigger?.consume() ?: return@LaunchedEffect
        soundBoard.mixer.play(trigger.name)
    }
}
