package dev.jvmname.accord.ui.main

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.CallMerge
import androidx.compose.material.icons.filled.Create
import androidx.compose.material.icons.outlined.Timer
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.slack.circuit.codegen.annotations.CircuitInject
import dev.jvmname.accord.ui.StandardScaffold
import dev.jvmname.accord.ui.main.MainEvent.CreateMat
import dev.jvmname.accord.ui.main.MainEvent.JoinMat
import dev.jvmname.accord.ui.main.MainEvent.SoloRideTime
import dev.zacsweers.metro.AppScope

@[Composable CircuitInject(MainScreen::class, AppScope::class)]
fun MainContent(state: MainState, modifier: Modifier) {
    StandardScaffold(
        title = "Accord", modifier = modifier.fillMaxSize()
    ) { padding ->
        Column(
            modifier = Modifier
                .background(MaterialTheme.colorScheme.background)
                .padding(padding)
                .fillMaxSize()
                .padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            IconTextButton(
                modifier = Modifier,
                icon = Icons.Default.Create,
                text = "Create Mat",
                onClick = { state.eventSink(CreateMat) }
            )
            IconTextButton(
                modifier = Modifier,
                icon = Icons.AutoMirrored.Filled.CallMerge,
                text = "Join Mat",
                onClick = { state.eventSink(JoinMat) }
            )

            IconTextButton(
                modifier = Modifier,
                icon = Icons.Outlined.Timer,
                text = "Track Ride Time (Solo)",
                onClick = { state.eventSink(SoloRideTime) }
            )
        }
    }

}

@Composable
private fun IconTextButton(
    modifier: Modifier,
    icon: ImageVector,
    text: String,
    onClick: () -> Unit
) {
    FilledTonalButton(
        modifier = modifier.size(250.dp, ButtonDefaults.MinHeight + 15.dp),
        onClick = onClick,
        shape = RoundedCornerShape(10.dp)
    ) {
        Icon(icon, contentDescription = "")
        Spacer(modifier.width(6.dp))
        Text(text, style = MaterialTheme.typography.bodyLarge)
    }
}

@Preview
@Composable
private fun MainContentPreview() {
    MainContent(
        state = MainState(
            mat = null,
            eventSink = {}
        ),
        modifier = Modifier
    )
}