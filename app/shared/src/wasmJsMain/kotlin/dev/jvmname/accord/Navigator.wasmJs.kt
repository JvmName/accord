package dev.jvmname.accord

import androidx.compose.runtime.Composable
import com.slack.circuit.backstack.SaveableBackStack
import com.slack.circuit.foundation.rememberCircuitNavigator
import com.slack.circuit.runtime.Navigator

@Composable
actual fun platformNavigator(backstack: SaveableBackStack, onRootPop: () -> Unit): Navigator {
    return rememberCircuitNavigator(backStack = backstack, onRootPop = { onRootPop() })
}