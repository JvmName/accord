package dev.jvmname.accord.ui.common

import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalInspectionMode
import androidx.compose.ui.util.fastMap
import app.lexilabs.basic.sound.SoundBoard
import app.lexilabs.basic.sound.SoundByte
import app.lexilabs.basic.sound.play
import dev.jvmname.accord.di.LocalGraph
import dev.jvmname.accord.di.LocalPlatformContext
import dev.jvmname.accord.domain.control.AudioEvent
import dev.jvmname.accord.domain.control.AudioTrigger
import dev.jvmname.accord.shared.resources.Res
import kotlinx.coroutines.delay

// Maps each trigger to a stable name used as the SoundByte key and mixer lookup.

@Composable
fun AudioPlayback(event: AudioEvent?) {
    if (LocalInspectionMode.current) return
    val context = LocalPlatformContext.current
    val soundBoard = remember { SoundBoard(context = context) }
    val volumeBooster = LocalGraph.current.volumeBooster

    // Populate soundBytes and start the playback coroutine once.
    // powerUp() loads audio lazily when a name arrives — no async load race.
    DisposableEffect(Unit) {
        soundBoard.soundBytes.addAll(
            AudioTrigger.entries.fastMap { trigger ->
                SoundByte(trigger.name, Res.getUri("files/${trigger.filename}"))
            }
        )

        soundBoard.powerUp()
        volumeBooster.boost()
        onDispose {
            try {
                soundBoard.powerDown()
            } finally {
                volumeBooster.restore()
            }
        }
    }

    // Re-runs only when a new AudioEvent object arrives (identity change).
    // consume() prevents double-firing if recomposition races.
    LaunchedEffect(event) {
        val trigger = event?.trigger?.consume() ?: return@LaunchedEffect
        try {
            volumeBooster.boost()
            soundBoard.mixer.play(trigger.name)
            delay(trigger.length)
        } finally {
            volumeBooster.restore()

        }
    }
}
