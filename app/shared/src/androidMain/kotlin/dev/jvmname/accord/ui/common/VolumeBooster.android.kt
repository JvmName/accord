package dev.jvmname.accord.ui.common

import android.media.AudioManager
import androidx.core.content.getSystemService
import co.touchlab.kermit.Logger
import dev.jvmname.accord.di.PlatformContext
import dev.jvmname.accord.prefs.Prefs
import dev.zacsweers.metro.AppScope
import dev.zacsweers.metro.Inject
import dev.zacsweers.metro.SingleIn
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch

@[Inject SingleIn(AppScope::class)]
actual class VolumeBooster(
    private val context: PlatformContext,
    private val prefs: Prefs,
    private val scope: CoroutineScope,
) {
    private var previousVolume: Int = -1
    private val am by lazy { context.getSystemService<AudioManager>()!! }
    private val log = Logger.withTag("Audio/VolumeBooster")

    actual fun boost() {
        val max = am.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
        val target = (max * 0.85).toInt()
        previousVolume = am.getStreamVolume(AudioManager.STREAM_MUSIC)
        log.i { "boosting volume: $previousVolume -> $target (max=$max)" }
        scope.launch { prefs.savePreBoostVolume(previousVolume) }
        am.setStreamVolume(AudioManager.STREAM_MUSIC, target, 0)
    }

    actual fun restore() {
        log.i { "restoring volume: ${am.getStreamVolume(AudioManager.STREAM_MUSIC)} -> $previousVolume" }
        am.setStreamVolume(AudioManager.STREAM_MUSIC, previousVolume, 0)
        previousVolume = -1
        scope.launch { prefs.clearPreBoostVolume() }
    }
}
