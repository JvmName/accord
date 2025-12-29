package dev.jvmname.accord

import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Window
import androidx.compose.ui.window.WindowPosition
import androidx.compose.ui.window.application
import androidx.compose.ui.window.rememberWindowState
import com.slack.circuit.backstack.SaveableBackStack
import com.slack.circuit.foundation.rememberCircuitNavigator
import com.slack.circuit.runtime.Navigator
import dev.jvmname.accord.di.AccordGraph
import dev.jvmname.accord.di.EmptyPlatformContext
import dev.zacsweers.metro.createGraphFactory
import kotlin.time.Clock

fun main() = application {
    val windowState =
        rememberWindowState(
            width = 1200.dp,
            height = 800.dp,
            position = WindowPosition(Alignment.Center),
        )

    val graph = createGraphFactory<AccordGraph.Factory>().create(EmptyPlatformContext, Clock.System)

    Window(
        title = "Accord",
        onCloseRequest = ::exitApplication,
        state = windowState,
    ) {
        App(graph.circuit, ::exitApplication)
    }
}

@Composable
actual fun platformNavigator(backstack: SaveableBackStack, onRootPop: () -> Unit): Navigator {
    return rememberCircuitNavigator(backStack = backstack, onRootPop = { onRootPop() })
}