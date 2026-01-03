package dev.jvmname.accord.ui.control

import androidx.compose.animation.AnimatedContent
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement.spacedBy
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.NextPlan
import androidx.compose.material.icons.filled.HeartBroken
import androidx.compose.material.icons.filled.MoveUp
import androidx.compose.material.icons.filled.Replay
import androidx.compose.material.icons.outlined.PauseCircle
import androidx.compose.material.icons.outlined.PlayArrow
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilledTonalIconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalInspectionMode
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import co.touchlab.kermit.Logger
import com.slack.circuit.codegen.annotations.CircuitInject
import dev.jvmname.accord.domain.Competitor
import dev.jvmname.accord.domain.color
import dev.jvmname.accord.domain.control.RoundEvent
import dev.jvmname.accord.domain.control.Score
import dev.jvmname.accord.domain.control.buttonHold
import dev.jvmname.accord.domain.nameStr
import dev.jvmname.accord.ui.StubVibrator
import dev.jvmname.accord.ui.common.IconTextButton
import dev.jvmname.accord.ui.common.StandardScaffold
import dev.jvmname.accord.ui.control.ControlTimeEvent.ButtonPress
import dev.jvmname.accord.ui.control.ControlTimeEvent.ButtonRelease
import dev.jvmname.accord.ui.theme.AccordTheme
import dev.zacsweers.metro.AppScope
import top.ltfan.multihaptic.compose.rememberVibrator
import kotlin.time.Duration.Companion.minutes
import kotlin.time.Duration.Companion.seconds

private typealias EventSink = (ControlTimeEvent) -> Unit


@[Composable CircuitInject(ControlTimeScreen::class, AppScope::class)]
fun ControlTimeContent(state: ControlTimeState, modifier: Modifier) {
    val vibrator = when {
        LocalInspectionMode.current -> remember { StubVibrator }
        else -> rememberVibrator()
    }

    state.matchState.haptic?.effect?.consume()?.let { vibrator.vibrate(it) }

    StandardScaffold(
        modifier = modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background),
        title = "Control Time: ${state.matName}",
        onBackClick = { state.eventSink(ControlTimeEvent.Back) },
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

            state.matchState
                .roundInfo
                ?.remainingHumanTime()
                ?.let {
                    Text(
                        it,
                        style = MaterialTheme.typography.displayLargeEmphasized,
                        fontWeight = FontWeight.Medium,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                }

            Spacer(modifier = Modifier.height(32.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = spacedBy(8.dp)
            ) {
                Competitor.entries.forEach { competitor ->
                    PlayerControl(
                        modifier = Modifier.weight(1f),
                        points = state.matchState.score.getPoints(competitor),
                        controlDuration = state.matchState.score.controlTimeHumanReadable(competitor),
                        color = competitor.color,
                        playerName = competitor.nameStr,
                        eventSink = state.eventSink,
                        player = competitor
                    )
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            RoundControlsSheet(state = state.rememberControlActions())
        }
    }
}


@Composable
fun RoundControlsSheet(modifier: Modifier = Modifier, state: RoundControlActions) {
    Card(
        modifier = modifier.fillMaxSize(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
    ) {
        FlowRow(
            modifier = Modifier.padding(16.dp),
            horizontalArrangement = spacedBy(8.dp),

            ) {
            state.beginNextRound?.let { beginNextRound ->
                FilledTonalIconButton(onClick = beginNextRound) {
                    Icon(Icons.AutoMirrored.Filled.NextPlan, "")
                }
            }
            state.resume?.let { resume ->
                FilledTonalIconButton(onClick = resume) {
                    Icon(Icons.Outlined.PlayArrow, "")
                }
            }
            state.pause?.let { pause ->
                FilledTonalIconButton(onClick = pause) {
                    Icon(Icons.Outlined.PauseCircle, "")
                }
            }
            state.submission?.let { submission ->
                FilledTonalIconButton(onClick = submission) {
                    Icon(Icons.Default.HeartBroken, "")
                }
            }
            state.reset?.let { reset ->
                FilledTonalIconButton(onClick = reset) {
                    Icon(Icons.Default.Replay, "")
                }
            }
        }
    }
}

@Composable
private fun PlayerControl(
    points: String,
    controlDuration: String?,
    color: Color,
    playerName: String,
    player: Competitor,
    eventSink: EventSink,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            text = points,
            color = color,
            style = MaterialTheme.typography.displayLarge.copy(fontSize = 50.sp),
            fontWeight = FontWeight.Medium
        )

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
        IconTextButton(
            modifier = Modifier
                .fillMaxHeight(0.80f)
                .clickable(false) {
                    Logger.d { "Clicked not pressed" }
                    eventSink(ButtonPress(player))
                    eventSink(ButtonRelease(player))
                }
                .buttonHold(
                    onPress = {
                        Logger.d { "UI press $player" }
                        eventSink(ButtonPress(player))
                    },
                    onRelease = {
                        Logger.d { "UI press $player" }
                        eventSink(ButtonRelease(player))
                    }
                ),
            icon = Icons.Default.MoveUp,
            text = "$playerName controlling",
            colors = ButtonDefaults.buttonColors(containerColor = color),
            onClick = {
                Logger.d { "Clicked not pressed" }
                eventSink(ButtonPress(player))
                eventSink(ButtonRelease(player))
            }
        )
    }
}

@Preview
@Composable
private fun ControlTimeContentPreview() {
    AccordTheme {
        ControlTimeContent(
            state = ControlTimeState(
                matName = "Bay JJ",
                matchState = MatchState(
                    score = Score(
                        redPoints = 22,
                        bluePoints = 11,
                        activeControlTime = null,
                        activeCompetitor = null,
                        techFallWin = null
                    ),
                    haptic = null,
                    roundInfo = RoundEvent(
                        remaining = 2.minutes + 30.seconds,
                        roundNumber = 1,
                        totalRounds = 3,
                        state = RoundEvent.RoundState.STARTED
                    )
                ),
                eventSink = { },
            ),
            modifier = Modifier
        )
    }
}

@Preview
@Composable
private fun ControlTimeContentPreview_Holding() {
    AccordTheme {
        ControlTimeContent(
            state = ControlTimeState(
                matName = "Bay JJ",
                matchState = MatchState(
                    score = Score(
                        redPoints = 22,
                        bluePoints = 11,
                        activeControlTime = 1.5.seconds,
                        activeCompetitor = Competitor.BLUE,
                        techFallWin = null
                    ),
                    haptic = null,
                    roundInfo = RoundEvent(
                        remaining = 2.minutes + 30.seconds,
                        roundNumber = 1,
                        totalRounds = 3,
                        state = RoundEvent.RoundState.STARTED
                    ),
                ),
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
            state = RoundControlActions(
                beginNextRound = {},
                resume = {},
                pause = {},
                submission = {},
                reset = {},
            )
        )
    }
}