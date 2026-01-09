package dev.jvmname.accord

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.platform.LocalContext
import com.slack.circuit.backstack.SaveableBackStack
import com.slack.circuit.foundation.rememberCircuitNavigator
import com.slack.circuit.runtime.Navigator
import com.slack.circuitx.android.rememberAndroidScreenAwareNavigator
import dev.jvmname.accord.di.LocalGraph
import dev.jvmname.accord.di.LocalPlatformContext

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        setContent {
            val graph = (application as AccordApplication).graph
            CompositionLocalProvider(
                LocalGraph provides graph,
                LocalPlatformContext provides this@MainActivity
            ) {
                App(graph.circuit, ::finish)
            }
        }
    }
}

@Composable
actual fun platformNavigator(backstack: SaveableBackStack, onRootPop: () -> Unit): Navigator {
    return rememberAndroidScreenAwareNavigator(
        delegate = rememberCircuitNavigator(backStack = backstack, onRootPop = { onRootPop() }),
        context = LocalContext.current
    )
}