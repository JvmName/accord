package dev.jvmname.accord

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import com.slack.circuit.backstack.SaveableBackStack
import com.slack.circuit.backstack.rememberSaveableBackStack
import com.slack.circuit.foundation.Circuit
import com.slack.circuit.foundation.CircuitCompositionLocals
import com.slack.circuit.foundation.NavigableCircuitContent
import com.slack.circuit.overlay.ContentWithOverlays
import com.slack.circuit.runtime.Navigator
import com.slack.circuitx.gesturenavigation.GestureNavigationDecorationFactory
import dev.jvmname.accord.ui.control.ControlTimeScreen
import dev.jvmname.accord.ui.control.ControlTimeType
import dev.jvmname.accord.ui.theme.AccordTheme

@Composable
fun App(circuit: Circuit, onRootPop: () -> Unit) {
    //TODO change this
    val backstack = rememberSaveableBackStack(root = ControlTimeScreen(ControlTimeType.SOLO))
    val navigator = platformNavigator(backstack, onRootPop)
    AccordTheme {
        CircuitCompositionLocals(circuit) {
            ContentWithOverlays {
                NavigableCircuitContent(
                    navigator = navigator,
                    backStack = backstack,
                    decoratorFactory = remember(navigator) {
                        GestureNavigationDecorationFactory(onBackInvoked = navigator::pop)
                    }
                )
            }
        }
    }
}

@Composable
expect fun platformNavigator(backstack: SaveableBackStack, onRootPop: () -> Unit): Navigator