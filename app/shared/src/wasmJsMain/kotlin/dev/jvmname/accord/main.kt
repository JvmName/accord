package dev.jvmname.accord

import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.window.ComposeViewport
import com.slack.circuit.backstack.SaveableBackStack
import com.slack.circuit.foundation.rememberCircuitNavigator
import com.slack.circuit.runtime.Navigator
import dev.jvmname.accord.di.AccordGraph
import dev.jvmname.accord.di.EmptyPlatformContext
import dev.jvmname.accord.di.LocalGraph
import dev.jvmname.accord.di.LocalPlatformContext
import dev.zacsweers.metro.createGraphFactory
import kotlin.time.Clock

fun main() {
    val graph = createGraphFactory<AccordGraph.Factory>().create(EmptyPlatformContext, Clock.System)

    ComposeViewport {
        CompositionLocalProvider(
            LocalGraph provides graph,
            LocalPlatformContext provides EmptyPlatformContext,
        ) {
            App(graph.circuit, { /*TODO*/ })
        }
    }
}

@Composable
actual fun platformNavigator(backstack: SaveableBackStack, onRootPop: () -> Unit): Navigator {
    return rememberCircuitNavigator(backStack = backstack, onRootPop = { onRootPop() })
}