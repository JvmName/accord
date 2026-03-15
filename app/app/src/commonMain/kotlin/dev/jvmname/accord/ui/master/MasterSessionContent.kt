package dev.jvmname.accord.ui.master

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.slack.circuit.codegen.annotations.CircuitInject
import dev.jvmname.accord.di.MatchScope
import dev.jvmname.accord.network.CompetitorColor
import dev.jvmname.accord.network.MatchId
import dev.jvmname.accord.ui.common.StandardScaffold
import dev.jvmname.accord.ui.theme.AccordTheme

@[Composable CircuitInject(MasterSessionScreen::class, MatchScope::class)]
fun MasterSessionContent(state: MasterSessionState, modifier: Modifier = Modifier) {
    var showSubmissionDialog by remember { mutableStateOf(false) }

    if (showSubmissionDialog) {
        SubmissionDialog(
            onConfirm = { submission, submitter ->
                showSubmissionDialog = false
                state.eventSink(MasterSessionEvent.EndRound(submission, submitter))
            },
            onDismiss = { showSubmissionDialog = false }
        )
    }

    StandardScaffold(
        title = "Match",
        onBackClick = { state.eventSink(MasterSessionEvent.ReturnToMain) },
        modifier = modifier.fillMaxSize(),
        topBarActions = {
            TextButton(onClick = { state.eventSink(MasterSessionEvent.ShowCodes) }) {
                Text("Codes")
            }
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .padding(padding)
                .fillMaxSize()
                .padding(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // Score row
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceEvenly
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("RED", color = Color.Red, style = MaterialTheme.typography.labelLarge)
                    Text(state.redName, style = MaterialTheme.typography.bodyMedium)
                    Text("${state.redScore}", style = MaterialTheme.typography.displayLarge)
                }
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("BLUE", color = Color.Blue, style = MaterialTheme.typography.labelLarge)
                    Text(state.blueName, style = MaterialTheme.typography.bodyMedium)
                    Text("${state.blueScore}", style = MaterialTheme.typography.displayLarge)
                }
            }

            // Timer
            Text(
                state.elapsedSeconds.formatAsTimer(),
                style = MaterialTheme.typography.headlineLarge
            )

            Text("Round ${state.roundNumber}")

            // Control buttons
            if (!state.isMatchStarted && !state.isMatchEnded) {
                Button(
                    onClick = { state.eventSink(MasterSessionEvent.StartMatch) },
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("Start Match")
                }
            }

            if (state.isMatchStarted && !state.isMatchEnded) {
                if (!state.isPaused) {
                    Button(
                        onClick = { state.eventSink(MasterSessionEvent.PauseRound) },
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text("Pause")
                    }
                    Button(
                        onClick = { showSubmissionDialog = true },
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text("End Round")
                    }
                } else {
                    Button(
                        onClick = { state.eventSink(MasterSessionEvent.ResumeRound) },
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text("Resume")
                    }
                }
                Button(
                    onClick = { state.eventSink(MasterSessionEvent.EndMatch) },
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error)
                ) {
                    Text("End Match")
                }
            }

            if (state.isMatchEnded) {
                Text("Match Complete", style = MaterialTheme.typography.headlineMedium)
                // TODO: show winner — pass winner through state
                Button(
                    onClick = { state.eventSink(MasterSessionEvent.ReturnToMain) },
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("Return to Main")
                }
                // TODO: navigate to NewMatchScreen — wire in task 10 (already built)
            }

            state.error?.let {
                Text(
                    it,
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodySmall
                )
            }
        }
    }
}

private fun Long.formatAsTimer(): String = "%02d:%02d".format(this / 60, this % 60)

@Composable
private fun SubmissionDialog(
    onConfirm: (String?, CompetitorColor?) -> Unit,
    onDismiss: () -> Unit,
) {
    var submissionText by remember { mutableStateOf("") }
    var selectedSubmitter by remember { mutableStateOf<CompetitorColor?>(null) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("End Round") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(
                    value = submissionText,
                    onValueChange = { submissionText = it },
                    label = { Text("Submission (optional)") },
                    placeholder = { Text("e.g. rear naked choke") },
                    singleLine = true,
                )
                Text("Submitted by:", style = MaterialTheme.typography.bodyMedium)
                Row(verticalAlignment = Alignment.CenterVertically) {
                    RadioButton(
                        selected = selectedSubmitter == CompetitorColor.RED,
                        onClick = { selectedSubmitter = CompetitorColor.RED }
                    )
                    Text("Red")
                    Spacer(Modifier.width(16.dp))
                    RadioButton(
                        selected = selectedSubmitter == CompetitorColor.BLUE,
                        onClick = { selectedSubmitter = CompetitorColor.BLUE }
                    )
                    Text("Blue")
                }
            }
        },
        confirmButton = {
            TextButton(onClick = {
                onConfirm(
                    submissionText.ifBlank { null },
                    selectedSubmitter
                )
            }) { Text("Confirm") }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        }
    )
}

@Preview
@Composable
private fun MasterSessionContentPreview() {
    AccordTheme {
        MasterSessionContent(
            state = MasterSessionState(
                matchId = MatchId("preview-match-1"),
                redName = "Alice",
                blueName = "Bob",
                redScore = 3,
                blueScore = 1,
                elapsedSeconds = 127L,
                roundNumber = 2,
                isMatchStarted = true,
                isMatchEnded = false,
                isPaused = false,
                error = null,
                eventSink = {},
            )
        )
    }
}
