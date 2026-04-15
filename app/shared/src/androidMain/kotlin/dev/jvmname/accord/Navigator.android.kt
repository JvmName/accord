package dev.jvmname.accord

import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalContext
import com.slack.circuit.backstack.SaveableBackStack
import com.slack.circuit.foundation.rememberCircuitNavigator
import com.slack.circuit.runtime.Navigator
import com.slack.circuitx.android.rememberAndroidScreenAwareNavigator

@Composable
actual fun platformNavigator(backstack: SaveableBackStack, onRootPop: () -> Unit): Navigator {
    return rememberAndroidScreenAwareNavigator(
        delegate = rememberCircuitNavigator(backStack = backstack, onRootPop = { onRootPop() }),
        context = LocalContext.current
    )
}
