package dev.jvmname.accord.ui.main

import accord.shared.BuildConfig
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.CallMerge
import androidx.compose.material.icons.automirrored.outlined.NoteAdd
import androidx.compose.material.icons.filled.AddCircleOutline
import androidx.compose.material.icons.filled.Replay
import androidx.compose.material.icons.outlined.Timer
import androidx.compose.material3.Card
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.slack.circuit.codegen.annotations.CircuitInject
import dev.jvmname.accord.ui.common.StandardScaffold
import dev.jvmname.accord.ui.main.MainEvent.ContinueMat
import dev.jvmname.accord.ui.main.MainEvent.CreateMat
import dev.jvmname.accord.ui.main.MainEvent.JoinMat
import dev.jvmname.accord.ui.main.MainEvent.RejoinMat
import dev.jvmname.accord.ui.main.MainEvent.SoloRideTime
import dev.jvmname.accord.ui.theme.AccordTheme
import dev.zacsweers.metro.AppScope

@[Composable CircuitInject(MainScreen::class, AppScope::class)]
fun MainContent(state: MainState, modifier: Modifier) {
    StandardScaffold(
        title = "Accord", modifier = modifier.fillMaxSize()
    ) { padding ->
        BoxWithConstraints(
            modifier = Modifier
                .background(MaterialTheme.colorScheme.background)
                .fillMaxSize()
                .padding(padding),
            contentAlignment = Alignment.Center,
        ) {
            val isTablet = maxWidth >= 600.dp
            val cardSpacing = if (isTablet) 32.dp else 12.dp

            Column(
                modifier = Modifier
                    .widthIn(max = 600.dp)
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp),
                verticalArrangement = Arrangement.spacedBy(cardSpacing),
            ) {
                if (state.canRejoin && state.mat != null) {
                    ActionCard(
                        icon = Icons.Default.Replay,
                        title = "Rejoin Mat",
                        description = "Return to ${state.mat.name}",
                        onClick = { state.eventSink(RejoinMat) }
                    )
                }
                if (state.mat != null) {
                    ActionCard(
                        icon = Icons.Default.AddCircleOutline,
                        title = "New Match",
                        description = "Start a new match on ${state.mat.name}",
                        onClick = { state.eventSink(ContinueMat) }
                    )
                }
                ActionCard(
                    icon = Icons.AutoMirrored.Outlined.NoteAdd,
                    title = "Create Match",
                    description = "Start a new mat and invite judges",
                    onClick = { state.eventSink(CreateMat) }
                )
                ActionCard(
                    icon = Icons.AutoMirrored.Filled.CallMerge,
                    title = "Join Mat",
                    description = "Enter an invite code to join an existing mat",
                    onClick = { state.eventSink(JoinMat) }
                )
                ActionCard(
                    icon = Icons.Outlined.Timer,
                    title = "Control Time (Offline Mode)",
                    description = "Practice timing without a network connection",
                    onClick = { state.eventSink(SoloRideTime) }
                )
                Text(
                    "v${BuildConfig.VERSION_NAME}",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.align(Alignment.CenterHorizontally)
                )
            }
        }
    }
}

@Composable
private fun ActionCard(
    icon: ImageVector,
    title: String,
    description: String,
    onClick: () -> Unit,
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        onClick = onClick,
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 32.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                modifier = Modifier.size(28.dp),
                tint = MaterialTheme.colorScheme.primary
            )
            Spacer(Modifier.width(16.dp))
            Column {
                Text(title, style = MaterialTheme.typography.titleMedium)
                Text(
                    description,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}

@Preview
@Composable
private fun MainContentPreview() {
    AccordTheme {
        MainContent(
            state = MainState(
                mat = null,
                eventSink = {}
            ),
            modifier = Modifier
        )
    }
}