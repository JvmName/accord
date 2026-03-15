package dev.jvmname.accord.ui.viewer

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import com.slack.circuit.codegen.annotations.CircuitInject
import dev.jvmname.accord.di.MatchScope
import dev.jvmname.accord.ui.common.StandardScaffold

@[Composable CircuitInject(ViewerScreen::class, MatchScope::class)]
fun ViewerContent(state: ViewerState, modifier: Modifier = Modifier) {
    // TODO: implement read-only score + time display
    StandardScaffold(
        title = "Viewing Match",
        onBackClick = { state.eventSink(ViewerEvent.Back) },
        modifier = modifier.fillMaxSize(),
    ) { _ ->
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text("Viewer mode coming soon") // TODO: replace with real UI
        }
    }
}
