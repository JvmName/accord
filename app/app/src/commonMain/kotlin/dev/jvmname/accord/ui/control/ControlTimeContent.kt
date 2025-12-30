package dev.jvmname.accord.ui.control

import androidx.compose.animation.AnimatedContent
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.MoveUp
import androidx.compose.material3.ButtonColors
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalInspectionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.slack.circuit.codegen.annotations.CircuitInject
import dev.jvmname.accord.domain.Competitor
import dev.jvmname.accord.domain.control.buttonHold
import dev.jvmname.accord.domain.color
import dev.jvmname.accord.domain.control.Score
import dev.jvmname.accord.domain.nameStr
import dev.jvmname.accord.ui.StubVibrator
import dev.jvmname.accord.ui.common.IconTextButton
import dev.jvmname.accord.ui.common.StandardScaffold
import dev.jvmname.accord.ui.control.ControlTimeEvent.ButtonPress
import dev.jvmname.accord.ui.control.ControlTimeEvent.ButtonRelease
import dev.zacsweers.metro.AppScope
import top.ltfan.multihaptic.compose.rememberVibrator
import kotlin.time.Duration.Companion.seconds

private typealias EventSink = (ControlTimeEvent) -> Unit


@[Composable CircuitInject(ControlTimeScreen::class, AppScope::class)]
fun ControlTimeContent(state: ControlTimeState, modifier: Modifier) {
    val vibrator = if (LocalInspectionMode.current) {
        remember { StubVibrator }
    } else {
        rememberVibrator()
    }

    state.haptic?.effect?.consume()?.let {
        vibrator.vibrate(it)
    }

    StandardScaffold(
        modifier = modifier.background(MaterialTheme.colorScheme.background),
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

            //TODO figure out if we need "vote status" text
//            Text("Placeholder Text", style = MaterialTheme.typography.bodyMedium)
//            Spacer(modifier = Modifier.height(32.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Competitor.entries.forEach { competitor ->
                    PlayerTime(
                        modifier = Modifier.weight(1f),
                        points = state.score.getPoints(competitor),
                        controlDuration = state.score.controlTimeHumanReadable(competitor),
                        color = competitor.color,
                        playerName = competitor.nameStr,
                        eventSink = state.eventSink,
                        player = competitor
                    )
                }
            }
        }
    }
}

@Composable
private fun PlayerTime(
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
            style = MaterialTheme.typography.displayLarge,
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

        Spacer(modifier = Modifier.height(24.dp))
        IconTextButton(
            modifier = Modifier
                .fillMaxHeight(0.95f)
                .clickable(false) {
                    println("Clicked not pressed")
                    eventSink(ButtonPress(player))
                    eventSink(ButtonRelease(player))
                }
                .buttonHold(
                    onPress = {
                        println("UI press $player")
                        eventSink(ButtonPress(player))
                    },
                    onRelease = {
                        println("UI press $player")
                        eventSink(ButtonRelease(player))
                    }
                ),
            icon = Icons.Default.MoveUp,
            text = "$playerName controlling",
            colors = ButtonDefaults.buttonColors(containerColor = color),
            onClick = {
                println("Clicked not pressed")
                eventSink(ButtonPress(player))
                eventSink(ButtonRelease(player))
            }
        )
    }
}



@Preview
@Composable
private fun ControlTimeContentPreview() {
    ControlTimeContent(
        state = ControlTimeState(
            matName = "Bay JJ",
            score = Score(
                redPoints = 22,
                bluePoints = 11,
                activeControlTime = null,
                activeCompetitor = null,
                sessionBasePoints = null,
                techFallWin = null
            ),
            haptic = null,
            eventSink = { },
        ),
        modifier = Modifier
    )
}

@Preview
@Composable
private fun ControlTimeContentPreview_Holding() {
    ControlTimeContent(
        state = ControlTimeState(
            matName = "Bay JJ",
            score = Score(
                redPoints = 22,
                bluePoints = 11,
                activeControlTime = 1.5.seconds,
                activeCompetitor = Competitor.BLUE,
                sessionBasePoints = 22,
                techFallWin = null
            ),
            haptic = null,
            eventSink = { },
        ),
        modifier = Modifier
    )
}

