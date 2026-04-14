package dev.jvmname.accord.ui

import android.content.pm.ActivityInfo
import androidx.activity.compose.LocalActivity
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect

@Composable
actual fun LockLandscape() {
    val activity = LocalActivity.current ?: return
    val original = activity.requestedOrientation
    DisposableEffect(original) {
        activity.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_USER_LANDSCAPE
        onDispose {
            activity.requestedOrientation = original
        }
    }
}
