package dev.jvmname.accord.ui.session.master

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.input.TextFieldLineLimits
import androidx.compose.foundation.text.input.rememberTextFieldState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Password
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.Scoreboard
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material.icons.filled.StopCircle
import androidx.compose.material.icons.outlined.PlayArrow
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.slack.circuit.codegen.annotations.CircuitInject
import dev.jvmname.accord.di.MatchScope
import dev.jvmname.accord.domain.Competitor
import dev.jvmname.accord.domain.color
import dev.jvmname.accord.domain.control.score.Score
import dev.jvmname.accord.domain.nameStr
import dev.jvmname.accord.ui.common.IconTextButton
import dev.jvmname.accord.ui.common.StandardScaffold
import dev.jvmname.accord.ui.session.MasterSessionEvent
import dev.jvmname.accord.ui.session.MatchActions
import dev.jvmname.accord.ui.session.MatchState
import dev.jvmname.accord.ui.theme.AccordTheme

@[Composable CircuitInject(MasterSessionScreen::class, MatchScope::class)]
fun MasterSessionContent(state: MasterSessionState, modifier: Modifier = Modifier) {
    if (state.showEndRoundDialog) {
        SubmissionDialog(
            onConfirm = { submission, submitter ->
                state.eventSink(MasterSessionEvent.EndRound(submission, submitter))
            },
            onDismiss = { state.eventSink(MasterSessionEvent.DismissEndRoundDialog) }
        )
    }

    StandardScaffold(
        title = "Tablet: ${state.matName}",
        onBackClick = { state.eventSink(MasterSessionEvent.ReturnToMain) },
        modifier = modifier.fillMaxSize(),
        topBarActions = {
            IconButton(onClick = { state.eventSink(MasterSessionEvent.ShowCodes) }) {
                Icon(Icons.Default.Password, "")
            }
            IconButton(onClick = { state.eventSink(MasterSessionEvent.ShowScores) }){
                Icon(Icons.Default.Scoreboard, "")
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

            Text(
                state.matchState.timerDisplay,
                style = MaterialTheme.typography.displayLargeEmphasized,
                fontWeight = FontWeight.Medium,
                color = MaterialTheme.colorScheme.onSurface
            )

            state.matchState.roundLabel?.let { Text(it) }

            // Score row
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceEvenly
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(state.redName, style = MaterialTheme.typography.bodyMedium)
                    Text(
                        "${state.matchState.score.redPoints}",
                        style = MaterialTheme.typography.displayLarge,
                        color = Color.Red
                    )
                }
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(state.blueName, style = MaterialTheme.typography.bodyMedium)
                    Text(
                        "${state.matchState.score.bluePoints}",
                        style = MaterialTheme.typography.displayLarge,
                        color = Color.Blue,
                    )
                }
            }

            // Control buttons
            if (!state.isMatchStarted && !state.isMatchEnded) {
                IconTextButton(
                    modifier = Modifier.fillMaxWidth(),
                    icon = Icons.Outlined.PlayArrow,
                    text = "Start Match",
                    onClick = { state.eventSink(MasterSessionEvent.StartMatch) }
                )
            }

            state.actions.pause?.let { pause ->
                IconTextButton(
                    modifier = Modifier.fillMaxWidth(),
                    icon = Icons.Default.Pause,
                    text = "Pause",
                    onClick = pause,
                )
            }
            state.actions.endRound?.let { endRound ->
                IconTextButton(
                    modifier = Modifier.fillMaxWidth(),
                    icon = Icons.Default.Stop,
                    text = "End Round",
                    onClick = endRound
                )
            }
            state.actions.resume?.let { resume ->
                IconTextButton(
                    modifier = Modifier.fillMaxWidth(),
                    icon = Icons.Outlined.PlayArrow,
                    text = "Resume",
                    onClick = resume
                )
            }
            if (state.isMatchStarted && !state.isMatchEnded) {
                IconTextButton(
                    modifier = Modifier.fillMaxWidth(),
                    icon = Icons.Default.StopCircle,
                    text = "End Match",
                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error),
                    onClick = { state.eventSink(MasterSessionEvent.EndMatch) }
                )
            }

            if (state.isMatchEnded) {
                Text("Match Complete", style = MaterialTheme.typography.headlineMedium)
                // TODO: show winner — pass winner through state
                IconTextButton(
                    modifier = Modifier.fillMaxWidth(),
                    icon = Icons.Default.Home,
                    text = "Return to Main",
                    onClick = { state.eventSink(MasterSessionEvent.ReturnToMain) }
                )
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

@Composable
private fun SubmissionDialog(
    onConfirm: (String?, Competitor?) -> Unit,
    onDismiss: () -> Unit,
) {

    val submissionText = rememberTextFieldState()
    var selected by remember { mutableStateOf<Competitor?>(null) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("End Round") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(
                    state = submissionText,
                    label = { Text("Submission (optional)") },
                    placeholder = { Text("e.g. rear naked choke") },
                    lineLimits = TextFieldLineLimits.SingleLine
                )
                Text("Winner:", style = MaterialTheme.typography.bodyMedium)

                SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                    Competitor.entries.forEachIndexed { index, competitor ->
                        SegmentedButton(
                            shape = SegmentedButtonDefaults.itemShape(index, 2),
                            border = SegmentedButtonDefaults.borderStroke(competitor.color),
                            onClick = { selected = competitor },
                            selected = competitor == selected,
                            label = { Text(competitor.nameStr) }
                        )
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = {
                onConfirm(
                    submissionText.text.ifBlank { null }?.toString(),
                    selected
                )
            }) { Text("Confirm") }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        }
    )
}

// Match started, active round in progress — pause + end round + end match visible
@Preview
@Composable
private fun MasterSessionContent_ActiveRound_Preview() {
    AccordTheme {
        MasterSessionContent(
            state = MasterSessionState(
                matName = "BayJJ",
                redName = "Alice",
                blueName = "Bob",
                matchState = MatchState(
                    score = Score(
                        redPoints = 3,
                        bluePoints = 1,
                        activeControlTime = null,
                        activeCompetitor = null,
                        techFallWin = null,
                    ),
                    roundInfo = null,
                    timerDisplay = "02:07",
                    roundLabel = "Round 2",
                    showPointControls = false,
                    controlDurations = emptyMap(),
                ),
                isMatchStarted = true,
                isMatchEnded = false,
                actions = MatchActions(pause = {}, endRound = {}),
                showEndRoundDialog = false,
                error = null,
                eventSink = {},
            )
        )
    }
}

// Match started, between rounds — only end match visible
@Preview
@Composable
private fun MasterSessionContent_BetweenRounds_Preview() {
    AccordTheme {
        MasterSessionContent(
            state = MasterSessionState(
                matName = "BayJJ",
                redName = "Alice",
                blueName = "Bob",
                matchState = MatchState(
                    score = Score(
                        redPoints = 3,
                        bluePoints = 1,
                        activeControlTime = null,
                        activeCompetitor = null,
                        techFallWin = null,
                    ),
                    roundInfo = null,
                    timerDisplay = "02:07",
                    roundLabel = null,
                    showPointControls = false,
                    controlDurations = emptyMap(),
                ),
                isMatchStarted = true,
                isMatchEnded = false,
                actions = MatchActions(),
                showEndRoundDialog = false,
                error = null,
                eventSink = {},
            )
        )
    }
}

@Preview
@Composable
private fun MasterSessionContent_Start_Preview() {
    AccordTheme {
        MasterSessionContent(
            state = MasterSessionState(
                matName = "BayJJ",
                redName = "Alice",
                blueName = "Bob",
                matchState = MatchState(
                    score = Score(0, 0, null, null, null),
                    roundInfo = null,
                    timerDisplay = "05:00",
                    roundLabel = "Round 1",
                    showPointControls = false,
                    controlDurations = emptyMap(),
                ),
                isMatchStarted = false,
                isMatchEnded = false,
                actions = MatchActions(),
                showEndRoundDialog = false,
                error = null,
                eventSink = {},
            )
        )
    }
}

@Preview
@Composable
private fun MasterSessionContent_Ended_Preview() {
    AccordTheme {
        MasterSessionContent(
            state = MasterSessionState(
                matName = "BayJJ",
                redName = "Alice",
                blueName = "Bob",
                matchState = MatchState(
                    score = Score(3, 1, null, null, null),
                    roundInfo = null,
                    timerDisplay = "00:00",
                    roundLabel = "Round 3",
                    showPointControls = false,
                    controlDurations = emptyMap(),
                ),
                isMatchStarted = true,
                isMatchEnded = true,
                actions = MatchActions(),
                showEndRoundDialog = false,
                error = null,
                eventSink = {},
            )
        )
    }
}

@Preview
@Composable
private fun MasterSessionContent_Dialog_Preview() {
    AccordTheme {
        MasterSessionContent(
            state = MasterSessionState(
                matName = "BayJJ",
                redName = "Alice",
                blueName = "Bob",
                matchState = MatchState(
                    score = Score(2, 2, null, null, null),
                    roundInfo = null,
                    timerDisplay = "01:30",
                    roundLabel = "Round 2",
                    showPointControls = false,
                    controlDurations = emptyMap(),
                ),
                isMatchStarted = true,
                isMatchEnded = false,
                actions = MatchActions(),
                showEndRoundDialog = true,
                error = null,
                eventSink = {},
            )
        )
    }
}

@Preview
@Composable
private fun MasterSessionContent_Paused_Preview() {
    AccordTheme {
        MasterSessionContent(
            state = MasterSessionState(
                matName = "BayJJ",
                redName = "Alice",
                blueName = "Bob",
                matchState = MatchState(
                    score = Score(2, 0, null, null, null),
                    roundInfo = null,
                    timerDisplay = "03:15",
                    roundLabel = "Round 1",
                    showPointControls = false,
                    controlDurations = emptyMap(),
                ),
                isMatchStarted = true,
                isMatchEnded = false,
                actions = MatchActions(resume = {}),
                showEndRoundDialog = false,
                error = null,
                eventSink = {},
            )
        )
    }
}

@Preview
@Composable
private fun MasterSessionContent_Error_Preview() {
    AccordTheme {
        MasterSessionContent(
            state = MasterSessionState(
                matName = "BayJJ",
                redName = "Alice",
                blueName = "Bob",
                matchState = MatchState(
                    score = Score(1, 0, null, null, null),
                    roundInfo = null,
                    timerDisplay = "03:42",
                    roundLabel = "Round 1",
                    showPointControls = false,
                    controlDurations = emptyMap(),
                ),
                isMatchStarted = true,
                isMatchEnded = false,
                actions = MatchActions(pause = {}, endRound = {}),
                showEndRoundDialog = false,
                error = "Failed to connect to server",
                eventSink = {},
            )
        )
    }
}

@Preview
@Composable
private fun SubmissionDialogPreview() {
    AccordTheme {
        SubmissionDialog(
            onConfirm = { _, _ -> },
            onDismiss = {}
        )
    }
}
