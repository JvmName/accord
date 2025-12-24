package dev.jvmname.accord

import androidx.compose.runtime.Composable
import com.slack.circuit.backstack.SaveableBackStack
import com.slack.circuit.backstack.rememberSaveableBackStack
import com.slack.circuit.foundation.Circuit
import com.slack.circuit.foundation.CircuitCompositionLocals
import com.slack.circuit.foundation.NavigableCircuitContent
import com.slack.circuit.overlay.ContentWithOverlays
import com.slack.circuit.runtime.Navigator
import dev.jvmname.accord.ui.main.MainScreen
import dev.jvmname.accord.ui.theme.AccordTheme

@Composable
fun App(circuit: Circuit, onRootPop: () -> Unit) {
    val backstack = rememberSaveableBackStack(root = MainScreen())
    val navigator = platformNavigator(backstack, onRootPop)
    AccordTheme {
        CircuitCompositionLocals(circuit) {
            ContentWithOverlays {
                NavigableCircuitContent(navigator, backstack)
            }
        }
    }
}

@Composable
expect fun platformNavigator(backstack: SaveableBackStack, onRootPop: () -> Unit): Navigator