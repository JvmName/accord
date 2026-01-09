package dev.jvmname.accord.ui.common

import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.remember
import app.lexilabs.basic.sound.SoundBoard
import app.lexilabs.basic.sound.SoundByte
import app.lexilabs.basic.sound.play
import dev.jvmname.accord.di.LocalPlatformContext
import dev.jvmname.accord.domain.control.AudioEvent
import dev.jvmname.accord.domain.control.AudioTrigger.RoundEnded.resource

@Composable
fun AudioPlayback(event: AudioEvent) {
    val context = LocalPlatformContext.current
    val player = remember(context) {
        SoundBoard(context = context)
    }

    val sound = remember(event) {
        val res = event.resource.consume()!!
        SoundByte("beep", resource).also {
            player.load(it)
            player.powerUp()
        }
    }

    DisposableEffect(event, context, player){
        player.mixer.play(sound)

        onDispose {
            player.powerDown()
        }
    }




}