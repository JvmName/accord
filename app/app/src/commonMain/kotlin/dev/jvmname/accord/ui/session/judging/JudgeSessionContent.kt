package dev.jvmname.accord.ui.session.judging

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement.spacedBy
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.wrapContentHeight
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.HeartBroken
import androidx.compose.material.icons.filled.MoveUp
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material.icons.outlined.PauseCircle
import androidx.compose.material.icons.outlined.PlayArrow
import androidx.compose.material.icons.outlined.Start
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilledTonalIconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedIconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalInspectionMode
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import co.touchlab.kermit.Logger
import com.slack.circuit.codegen.annotations.CircuitInject
import dev.jvmname.accord.di.MatchScope
import dev.jvmname.accord.domain.Competitor
import dev.jvmname.accord.domain.color
import dev.jvmname.accord.domain.control.rounds.MatchConfig
import dev.jvmname.accord.domain.control.rounds.RoundEvent
import dev.jvmname.accord.domain.control.score.Score
import dev.jvmname.accord.domain.nameStr
import dev.jvmname.accord.ui.StubVibrator
import dev.jvmname.accord.ui.common.HoldingButton
import dev.jvmname.accord.ui.common.StandardScaffold
import dev.jvmname.accord.ui.session.JudgeSessionEvent
import dev.jvmname.accord.ui.session.JudgeSessionEvent.ButtonPress
import dev.jvmname.accord.ui.session.JudgeSessionEvent.ButtonRelease
import dev.jvmname.accord.ui.session.ManualEditAction
import dev.jvmname.accord.ui.session.MatchActions
import dev.jvmname.accord.ui.session.MatchState
import dev.jvmname.accord.ui.theme.AccordTheme
import top.ltfan.multihaptic.compose.rememberVibrator
import kotlin.time.Duration.Companion.minutes
import kotlin.time.Duration.Companion.seconds

private typealias EventSink = (JudgeSessionEvent) -> Unit


@[Composable CircuitInject(JudgeSessionScreen::class, MatchScope::class)]
fun JudgeSessionContent(state: JudgeSessionState, modifier: Modifier) {
    val vibrator = when {
        LocalInspectionMode.current -> remember { StubVibrator }
        else -> rememberVibrator()
    }

    LaunchedEffect(state.hapticEvent) {
        state.hapticEvent?.effect?.consume()?.let { vibrator.vibrate(it) }
    }

    Box(modifier = modifier.fillMaxSize()) {
        StandardScaffold(
            modifier = Modifier
                .fillMaxSize()
                .background(MaterialTheme.colorScheme.background),
            title = "Judging: ${state.matName}",
            onBackClick = { state.eventSink(JudgeSessionEvent.Back) },
            topBarActions = {
                //TODO
//            IconButton(onClick = { TODO() }) {
//                Icon(
//                    imageVector = Icons.Default.Settings,
//                    contentDescription = ""
//                )
//            }
            }
        ) { padding ->
            Column(
                modifier = Modifier
                    .padding(padding)
                    .fillMaxWidth(),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Spacer(modifier = Modifier.height(32.dp))

                Text(
                    state.matchState.timerDisplay,
                    style = MaterialTheme.typography.displayLargeEmphasized,
                    fontWeight = FontWeight.Medium,
                    color = MaterialTheme.colorScheme.onSurface
                )

                state.matchState.roundLabel?.let {
                    Text(
                        text = it,
                        fontWeight = FontWeight.Medium,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                }

                if (state.matchState.roundInfo?.state == RoundEvent.RoundState.ENDED) {
                    Text(
                        text = "Break – Waiting for next round…",
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }

                Spacer(modifier = Modifier.height(32.dp))

                Row(
                    modifier = Modifier.fillMaxWidth().weight(3f),
                    horizontalArrangement = spacedBy(8.dp)
                ) {
                    Competitor.entries.forEach { competitor ->
                        PlayerControl(
                            modifier = Modifier.weight(1f),
                            points = state.matchState.score.getPoints(competitor),
                            controlDuration = state.matchState.controlDurations[competitor],
                            color = competitor.color,
                            playerName = competitor.nameStr,
                            manualEdit = state.actions.manualEdit,
                            eventSink = state.eventSink,
                            player = competitor
                        )
                    }
                }

                Spacer(modifier.weight(0.15f))
                RoundControlsSheet(actions = state.actions)
            }
        }

        if (state.isMatchEnded) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(MaterialTheme.colorScheme.scrim.copy(alpha = 0.6f)),
                contentAlignment = Alignment.Center
            ) {
                Card(modifier = Modifier.padding(32.dp)) {
                    Column(
                        modifier = Modifier.padding(24.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = spacedBy(16.dp)
                    ) {
                        Text("Match Over", style = MaterialTheme.typography.headlineMedium)
                        Button(
                            onClick = { state.eventSink(JudgeSessionEvent.Back) },
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Text("Return to Main Screen")
                        }
                    }
                }
            }
        }
    }
}


@Composable
private fun PlayerControl(
    points: Int,
    controlDuration: String?,
    color: Color,
    playerName: String,
    player: Competitor,
    manualEdit: ((Competitor, ManualEditAction) -> Unit)?,
    eventSink: EventSink,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier.fillMaxHeight().fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {

        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = spacedBy(6.dp)
        ) {
            AnimatedVisibility(manualEdit != null) {
                CompositionLocalProvider(LocalContentColor provides color) {
                    OutlinedIconButton(
                        onClick = {
                            if (points > 0) manualEdit?.invoke(player, ManualEditAction.DECREMENT)
                        },
                        enabled = points > 0
                    ) {
                        Icon(
                            Icons.Default.Remove,
                            contentDescription = "Decrease score"
                        )
                    }
                }
            }
            Text(
                modifier = Modifier.weight(1f),
                text = points.toString(),
                color = color,
                style = MaterialTheme.typography.displayLarge.copy(fontSize = 50.sp),
                textAlign = TextAlign.Center,
                fontWeight = FontWeight.Medium
            )
            CompositionLocalProvider(LocalContentColor provides color) {
                AnimatedVisibility(manualEdit != null) {
                    OutlinedIconButton(
                        onClick = { manualEdit?.invoke(player, ManualEditAction.INCREMENT) },
                    ) {
                        Icon(
                            Icons.Default.Add,
                            contentDescription = "Increase score"
                        )
                    }
                }
            }
        }

        AnimatedContent(controlDuration) {
            if (it == null) {
                Spacer(modifier = Modifier.height(22.dp))
            } else {
                Text(
                    text = "($it)",
                    color = color,
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.SemiBold
                )
            }
        }

        Spacer(modifier = Modifier.height(16.dp))
        HoldingButton(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth(),
            icon = Icons.Default.MoveUp,
            text = "$playerName controlling",
            containerColor = color,
            onPress = { eventSink(ButtonPress(player)) },
            onRelease = { eventSink(ButtonRelease(player)) },
        )
    }
}

@Composable
fun RoundControlsSheet(modifier: Modifier = Modifier, actions: MatchActions) {
    Card(
        modifier = modifier.fillMaxWidth().wrapContentHeight(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
    ) {
        FlowRow(
            modifier = Modifier.padding(16.dp).fillMaxWidth(),
            horizontalArrangement = spacedBy(8.dp, Alignment.CenterHorizontally),
        ) {

            val actionsList = remember(actions) {
                listOf(
                    actions.startRound to Icons.Outlined.Start,
                    actions.resume to Icons.Outlined.PlayArrow,
                    actions.pause to Icons.Outlined.PauseCircle,
                    actions.endRound to Icons.Default.HeartBroken,
//                    actions.reset to Icons.Default.Replay,
                )
            }

            for ((action, icon) in actionsList) {
                AnimatedVisibility(action != null) {
                    //TODO tooltip?
                    FilledTonalIconButton(
                        modifier = modifier.size(IconButtonDefaults.mediumContainerSize()),
                        onClick = {
                            Logger.d { "clicked action" }
                            action?.invoke()
                        }) {
                        Icon(icon, "", modifier = Modifier.size(32.dp))
                    }
                }
            }
        }
    }
}

@Preview
@Composable
private fun JudgeSessionContentPreview() {
    AccordTheme {
        JudgeSessionContent(
            state = JudgeSessionState(
                matName = "Bay JJ",
                matchState = MatchState(
                    score = Score(
                        redPoints = 22,
                        bluePoints = 11,
                        activeControlTime = null,
                        activeCompetitor = null,
                        techFallWin = null
                    ),
                    roundInfo = RoundEvent(
                        remaining = 2.minutes + 30.seconds,
                        roundNumber = 1,
                        totalRounds = 3,
                        round = MatchConfig.RdojoKombat.rounds[0],
                        state = RoundEvent.RoundState.STARTED
                    ),
                    timerDisplay = "2:30",
                    roundLabel = "Round 1 of 3",
                    controlDurations = emptyMap(),
                    roundScores = emptyMap(),
                ),
                actions = MatchActions(),
                eventSink = { },
            ),
            modifier = Modifier
        )
    }
}


@Preview
@Composable
private fun JudgeSessionContentPreview_Paused() {
    AccordTheme {
        JudgeSessionContent(
            state = JudgeSessionState(
                matName = "Bay JJ",
                matchState = MatchState(
                    score = Score(
                        redPoints = 22,
                        bluePoints = 11,
                        activeControlTime = null,
                        activeCompetitor = null,
                        techFallWin = null
                    ),
                    roundInfo = RoundEvent(
                        remaining = 2.minutes + 30.seconds,
                        roundNumber = 1,
                        totalRounds = 3,
                        round = MatchConfig.RdojoKombat.rounds[0],
                        state = RoundEvent.RoundState.PAUSED
                    ),
                    timerDisplay = "2:30",
                    roundLabel = "Round 1 of 3",
                    controlDurations = emptyMap(),
                    roundScores = emptyMap(),
                ),
                actions = MatchActions(),
                eventSink = { },
            ),
            modifier = Modifier
        )
    }
}


@Preview
@Composable
private fun JudgeSessionContentPreview_Holding() {
    AccordTheme {
        JudgeSessionContent(
            state = JudgeSessionState(
                matName = "Bay JJ",
                matchState = MatchState(
                    score = Score(
                        redPoints = 22,
                        bluePoints = 11,
                        activeControlTime = 1.5.seconds,
                        activeCompetitor = Competitor.BLUE,
                        techFallWin = null
                    ),
                    roundInfo = RoundEvent(
                        remaining = 2.minutes + 30.seconds,
                        roundNumber = 1,
                        totalRounds = 3,
                        round = MatchConfig.RdojoKombat.rounds[0],
                        state = RoundEvent.RoundState.STARTED
                    ),
                    timerDisplay = "2:30",
                    roundLabel = "Round 1 of 3",
                    controlDurations = mapOf(Competitor.BLUE to "(3)"),
                    roundScores = emptyMap(),
                ),
                actions = MatchActions(),
                eventSink = { },
            ),
            modifier = Modifier
        )
    }
}

@Preview
@Composable
private fun RoundControlsSheetPreview() {
    AccordTheme {

        RoundControlsSheet(
            modifier = Modifier,
            actions = MatchActions(
                startRound = {},
                resume = {},
                pause = {},
                endRound = {},
                reset = {},
            )
        )
    }
}