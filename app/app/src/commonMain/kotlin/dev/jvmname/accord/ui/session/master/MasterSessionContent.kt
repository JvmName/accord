package dev.jvmname.accord.ui.session.master

import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.NextPlan
import androidx.compose.material.icons.filled.HeartBroken
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Password
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.StopCircle
import androidx.compose.material.icons.outlined.PlayArrow
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.slack.circuit.codegen.annotations.CircuitInject
import com.slack.circuit.overlay.OverlayEffect
import com.slack.circuitx.overlays.BottomSheetOverlay
import dev.jvmname.accord.di.MatchScope
import dev.jvmname.accord.domain.Competitor
import dev.jvmname.accord.domain.control.rounds.RoundEvent
import dev.jvmname.accord.domain.control.rounds.RoundInfo
import dev.jvmname.accord.domain.control.score.Score
import dev.jvmname.accord.ui.LockLandscape
import dev.jvmname.accord.ui.common.IconTextButton
import dev.jvmname.accord.ui.common.StandardScaffold
import dev.jvmname.accord.ui.session.MasterSessionEvent
import dev.jvmname.accord.ui.session.MatchActions
import dev.jvmname.accord.ui.session.MatchState
import dev.jvmname.accord.ui.session.judging.MatchResult
import dev.jvmname.accord.ui.theme.AccordTheme
import dev.jvmname.accord.ui.theme.TabletCompetitor
import dev.jvmname.accord.ui.theme.TabletScore
import dev.jvmname.accord.ui.theme.TabletTimeDisplay

@OptIn(ExperimentalLayoutApi::class)
@[Composable CircuitInject(MasterSessionScreen::class, MatchScope::class)]
fun MasterSessionContent(state: MasterSessionState, modifier: Modifier = Modifier) {
    LockLandscape()
    if (state.showEndRoundDialog) {
        OverlayEffect(state.showEndRoundDialog) {
            val result = show(
                BottomSheetOverlay<Unit, SubmissionResult>(
                    model = Unit,
                    onDismiss = { SubmissionResult.Dismissed },
                ) { _, navigator -> SubmissionDialog(navigator) }
            )
            when (result) {
                is SubmissionResult.Confirmed -> state.eventSink(
                    MasterSessionEvent.RecordRoundResult(
                        winner = result.winner,
                        stoppage = result.stoppage,
                    )
                )

                SubmissionResult.Dismissed -> state.eventSink(MasterSessionEvent.DismissEndRoundDialog)
            }
        }
    }

    if (state.showScoresOverlay) {
        OverlayEffect(state.showScoresOverlay) {
            show(
                BottomSheetOverlay(model = Unit, onDismiss = {}) { _, _ ->
                    RoundScoresSheet(
                        rounds = state.roundDisplays,
                        redName = state.redName,
                        blueName = state.blueName,
                    )
                }
            )
            state.eventSink(MasterSessionEvent.DismissScores)
        }
    }

    StandardScaffold(
        title = "Tablet: ${state.matName}",
        onBackClick = { state.eventSink(MasterSessionEvent.ReturnToMain) },
        modifier = modifier.fillMaxSize(),
        topBarActions = {
            IconButton(onClick = { state.eventSink(MasterSessionEvent.ShowCodes) }) {
                Icon(Icons.Default.Password, "")
            }
            IconButton(onClick = { state.eventSink(MasterSessionEvent.ShowScores) }) {
                Box(
                    contentAlignment = Alignment.Center,
                    modifier = Modifier
                        .size(28.dp)
                        .border(1.5.dp, LocalContentColor.current, RoundedCornerShape(4.dp))
                ) {
                    Text(
                        "${state.matchState.roundScores[Competitor.RED] ?: 0}:${state.matchState.roundScores[Competitor.BLUE] ?: 0}",
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Bold,
                    )
                }
            }
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .padding(padding)
                .fillMaxSize()
                .padding(vertical = 72.dp, horizontal = 16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {

            // Combined scores + timer/label row
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(
                    modifier = Modifier.weight(0.31f),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text(state.redName, style = MaterialTheme.typography.TabletCompetitor)
                    Text(
                        state.matchState.score.redPoints.toString(),
                        style = MaterialTheme.typography.TabletScore,
                        color = Color.Red,
                        softWrap = false,
                    )
                }
                Column(
                    modifier = Modifier.weight(0.38f),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text(
                        state.matchState.timerDisplay,
                        style = MaterialTheme.typography.TabletTimeDisplay,
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                    state.matchState.roundLabel?.let {
                        Text(it, style = MaterialTheme.typography.displayLarge)
                    }
                }
                Column(
                    modifier = Modifier.weight(0.31f),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text(state.blueName, style = MaterialTheme.typography.TabletCompetitor)
                    Text(
                        "${state.matchState.score.bluePoints}",
                        style = MaterialTheme.typography.TabletScore,
                        color = Color.Blue,
                        softWrap = false,
                    )
                }
            }

            // Control buttons
            val roundInfo = state.matchState.roundInfo
            val isActiveBreak =
                roundInfo?.round is RoundInfo.Break && roundInfo.state == RoundEvent.RoundState.STARTED
            val buttonModifier = Modifier.width(275.dp).height(105.dp)
            FlowRow(
                modifier = Modifier.fillMaxWidth().padding(top = 64.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp, Alignment.CenterHorizontally),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                if (!isActiveBreak && roundInfo?.state == RoundEvent.RoundState.ENDED) {
                    IconTextButton(
                        modifier = buttonModifier,
                        icon = Icons.AutoMirrored.Outlined.NextPlan,
                        text = "Start Next Round",
                        onClick = { state.eventSink(MasterSessionEvent.StartRound) }
                    )
                }

                if (!state.isMatchStarted && state.matchResult == null) {
                    IconTextButton(
                        modifier = buttonModifier,
                        icon = Icons.Outlined.PlayArrow,
                        text = "Start Match",
                        onClick = { state.eventSink(MasterSessionEvent.StartMatch) }
                    )
                }

                state.actions.pause?.let { pause ->
                    IconTextButton(
                        modifier = buttonModifier,
                        icon = Icons.Default.Pause,
                        text = "Pause",
                        onClick = pause,
                    )
                }
                state.actions.endRound?.let { endRound ->
                    IconTextButton(
                        modifier = buttonModifier,
                        icon = Icons.Default.HeartBroken,
                        text = "Submission",
                        onClick = endRound,
                        colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error),
                    )
                }
                state.actions.resume?.let { resume ->
                    IconTextButton(
                        modifier = buttonModifier,
                        icon = Icons.Outlined.PlayArrow,
                        text = "Resume",
                        onClick = resume
                    )
                }
                if (state.isMatchStarted && state.matchResult == null && isActiveBreak) {
                    IconTextButton(
                        modifier = buttonModifier,
                        icon = Icons.Default.StopCircle,
                        text = "End Match",
                        colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error),
                        onClick = { state.eventSink(MasterSessionEvent.EndMatch) }
                    )
                }
            }

            state.matchResult?.let { matchResult ->
                Text(
                    "Match Complete",
                    style = MaterialTheme.typography.displayLargeEmphasized,
                    modifier = Modifier.padding(bottom = 16.dp)
                )

                Text(
                    matchResult.toText(),
                    style = MaterialTheme.typography.displayLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )

                IconTextButton(
                    modifier = buttonModifier,
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


// Match started, active round in progress — pause + end round + end match visible
@Preview(device = "spec:width=1429dp,height=857dp,dpi=224,isRound=false,orientation=landscape")
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
                        redPoints = 13,
                        bluePoints = 1,
                        activeControlTime = null,
                        activeCompetitor = null,
                        techFallWin = null,
                    ),
                    roundInfo = null,
                    timerDisplay = "2:07",
                    roundLabel = "Round 2",
                    controlDurations = emptyMap(),
                    roundScores = emptyMap(),
                ),
                isMatchStarted = true,
                matchResult = null,
                actions = MatchActions(pause = {}, endRound = {}),
                showEndRoundDialog = false,
                showScoresOverlay = false,
                roundDisplays = listOf(
                    RoundDisplayInfo(1, false, Competitor.RED, 12, 4),
                ),
                error = null,
                eventSink = {},
            )
        )
    }
}

// Match started, between rounds — only end match visible
@Preview(device = "spec:width=1429dp,height=857dp,dpi=224,isRound=false,orientation=landscape")
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
                        bluePoints = 14,
                        activeControlTime = null,
                        activeCompetitor = null,
                        techFallWin = null,
                    ),
                    roundInfo = null,
                    timerDisplay = "02:07",
                    roundLabel = null,
                    controlDurations = emptyMap(),
                    roundScores = emptyMap(),
                ),
                isMatchStarted = true,
                matchResult = null,
                actions = MatchActions(),
                showEndRoundDialog = false,
                showScoresOverlay = false,
                roundDisplays = emptyList(),
                error = null,
                eventSink = {},
            )
        )
    }
}

@Preview(device = "spec:width=1429dp,height=857dp,dpi=224,isRound=false,orientation=landscape")
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
                    controlDurations = emptyMap(),
                    roundScores = emptyMap(),
                ),
                isMatchStarted = false,
                matchResult = null,
                actions = MatchActions(),
                showEndRoundDialog = false,
                showScoresOverlay = false,
                roundDisplays = emptyList(),
                error = null,
                eventSink = {},
            )
        )
    }
}

@Preview(device = "spec:width=1429dp,height=857dp,dpi=224,isRound=false,orientation=landscape")
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
                    controlDurations = emptyMap(),
                    roundScores = emptyMap(),
                ),
                isMatchStarted = true,
                matchResult = MatchResult(
                    winConditions = "Points (12s), Points (9s)",
                    roundWinners = listOf(Competitor.RED, Competitor.BLUE, Competitor.RED)
                ),
                actions = MatchActions(),
                showEndRoundDialog = false,
                showScoresOverlay = false,
                roundDisplays = listOf(
                    RoundDisplayInfo(1, false, Competitor.RED, 12, 4),
                    RoundDisplayInfo(2, false, Competitor.BLUE, 3, 18),
                    RoundDisplayInfo(3, false, Competitor.RED, 9, 7),
                ),
                error = null,
                eventSink = {},
            )
        )
    }
}

@Preview(device = "spec:width=1429dp,height=857dp,dpi=224,isRound=false,orientation=landscape")
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
                    controlDurations = emptyMap(),
                    roundScores = emptyMap(),
                ),
                isMatchStarted = true,
                matchResult = null,
                actions = MatchActions(),
                showEndRoundDialog = true,
                showScoresOverlay = false,
                roundDisplays = emptyList(),
                error = null,
                eventSink = {},
            )
        )
    }
}

@Preview(device = "spec:width=1429dp,height=857dp,dpi=224,isRound=false,orientation=landscape")
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
                    controlDurations = emptyMap(),
                    roundScores = emptyMap(),
                ),
                isMatchStarted = true,
                matchResult = null,
                actions = MatchActions(resume = {}),
                showEndRoundDialog = false,
                showScoresOverlay = false,
                roundDisplays = emptyList(),
                error = null,
                eventSink = {},
            )
        )
    }
}

@Preview(device = "spec:width=1429dp,height=857dp,dpi=224,isRound=false,orientation=landscape")
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
                    controlDurations = emptyMap(),
                    roundScores = emptyMap(),
                ),
                isMatchStarted = true,
                matchResult = null,
                actions = MatchActions(pause = {}, endRound = {}),
                showEndRoundDialog = false,
                showScoresOverlay = false,
                roundDisplays = emptyList(),
                error = "Failed to connect to server",
                eventSink = {},
            )
        )
    }
}


