package dev.jvmname.accord

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.CompositionLocalProvider
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
                LocalPlatformContext provides this@MainActivity,
            ) {
                App(graph.circuit, ::finish)
            }
        }
    }
}
