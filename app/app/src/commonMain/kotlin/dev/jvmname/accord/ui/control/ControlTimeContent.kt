package dev.jvmname.accord.ui.control

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.wrapContentHeight
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.NextPlan
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.HeartBroken
import androidx.compose.material.icons.filled.MoveUp
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material.icons.outlined.PauseCircle
import androidx.compose.material.icons.outlined.PlayArrow
import androidx.compose.material3.ButtonDefaults
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
import dev.jvmname.accord.domain.Competitor
import dev.jvmname.accord.domain.color
import dev.jvmname.accord.domain.control.Score
import dev.jvmname.accord.domain.control.buttonHold
import dev.jvmname.accord.domain.control.rounds.BaseRound
import dev.jvmname.accord.domain.control.rounds.RoundConfig
import dev.jvmname.accord.domain.control.rounds.RoundEvent
import dev.jvmname.accord.domain.nameStr
import dev.jvmname.accord.ui.StubVibrator
import dev.jvmname.accord.ui.common.IconTextButton
import dev.jvmname.accord.ui.common.StandardScaffold
import dev.jvmname.accord.ui.control.ControlTimeEvent.ButtonPress
import dev.jvmname.accord.ui.control.ControlTimeEvent.ButtonRelease
import dev.jvmname.accord.ui.control.ControlTimeEvent.ManualPointEdit
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

            val remainingTime = remember(state.matchState.roundInfo) {
                state.matchState
                    .roundInfo
                    ?.remainingHumanTime()
                    ?: "0:00"
            }
            Text(
                remainingTime,
                style = MaterialTheme.typography.displayLargeEmphasized,
                fontWeight = FontWeight.Medium,
                color = MaterialTheme.colorScheme.onSurface
            )

            val roundNumber = remember(state.matchState.roundInfo) {
                val roundInfo = state.matchState.roundInfo
                when (val round = roundInfo?.round) {
                    null -> null
                    is BaseRound.Break -> "Break"
                    is BaseRound.Round -> "Round ${round.index} of ${roundInfo.totalRounds}"
                }
            }
            roundNumber?.let {
                Text(
                    text = it,
                    fontWeight = FontWeight.Medium,
                    color = MaterialTheme.colorScheme.onSurface
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
                        controlDuration = state.matchState.score.controlTimeHumanReadable(competitor),
                        color = competitor.color,
                        playerName = competitor.nameStr,
                        shouldShowPointControls = state.matchState.roundInfo?.state == RoundEvent.RoundState.PAUSED
                                && state.matchState.score.techFallWin == null,
                        eventSink = state.eventSink,
                        player = competitor
                    )
                }
            }

            Spacer(modifier.weight(0.15f))
            RoundControlsSheet(actions = state.rememberControlActions())
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
    shouldShowPointControls: Boolean,
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
            horizontalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            AnimatedVisibility(shouldShowPointControls) {
                CompositionLocalProvider(LocalContentColor provides color) {
                    OutlinedIconButton(
                        onClick = {
                            if (points > 0) eventSink(
                                ManualPointEdit(player, ManualPointEdit.Action.DECREMENT)
                            )
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
                AnimatedVisibility(shouldShowPointControls) {
                    OutlinedIconButton(
                        onClick = {
                            eventSink(ManualPointEdit(player, ManualPointEdit.Action.INCREMENT))
                        },
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
        IconTextButton(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
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

@Composable
fun RoundControlsSheet(modifier: Modifier = Modifier, actions: RoundControlActions) {
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
                    actions.beginNextRound to Icons.AutoMirrored.Outlined.NextPlan,
                    actions.resume to Icons.Outlined.PlayArrow,
                    actions.pause to Icons.Outlined.PauseCircle,
                    actions.submission to Icons.Default.HeartBroken,
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
                        round = RoundConfig.RdojoKombat.rounds[0],
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
private fun ControlTimeContentPreview_Paused() {
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
                        round = RoundConfig.RdojoKombat.rounds[0],
                        state = RoundEvent.RoundState.PAUSED
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
                        round = RoundConfig.RdojoKombat.rounds[0],
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
            actions = RoundControlActions(
                beginNextRound = {},
                resume = {},
                pause = {},
                submission = {},
                reset = {},
            )
        )
    }
}