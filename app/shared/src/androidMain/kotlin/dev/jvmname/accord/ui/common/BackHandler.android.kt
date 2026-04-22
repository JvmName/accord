package dev.jvmname.accord.ui.common

import androidx.activity.compose.BackHandler
import androidx.compose.runtime.Composable

@Composable
actual fun PreventBack() {
    BackHandler(enabled = true) {/*intentional no-op*/ }
}