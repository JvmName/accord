package dev.jvmname.accord.ui.ride_time

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.MoveUp
import androidx.compose.material3.ButtonDefaults
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
import dev.jvmname.accord.domain.Competitor
import dev.jvmname.accord.domain.buttonHold
import dev.jvmname.accord.domain.color
import dev.jvmname.accord.domain.nameStr
import dev.jvmname.accord.ui.IconTextButton
import dev.jvmname.accord.ui.StandardScaffold
import dev.jvmname.accord.ui.ride_time.RideTimeEvent.ButtonPress
import dev.jvmname.accord.ui.ride_time.RideTimeEvent.ButtonRelease
import dev.zacsweers.metro.AppScope

private typealias EventSink = (RideTimeEvent) -> Unit


@[Composable CircuitInject(RideTimeScreen::class, AppScope::class)]
fun RideTimeContent(state: RideTimeState, modifier: Modifier) {
    StandardScaffold(
        modifier = modifier.background(MaterialTheme.colorScheme.background),
        title = "Ride Time: ${state.matName}",
        onBackClick = { state.eventSink(RideTimeEvent.Back) },
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

            Text("Placeholder Text", style = MaterialTheme.typography.bodyMedium)

            Spacer(modifier = Modifier.height(32.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Competitor.entries.forEach { competitor ->
                    PlayerTime(
                        modifier = Modifier.weight(1f),
                        seconds = state.competitorTime(competitor),
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
    seconds: String,
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
            text = seconds,
            color = color,
            style = MaterialTheme.typography.displayLarge,
            fontWeight = FontWeight.Medium
        )
        Spacer(modifier = Modifier.height(24.dp))
        IconTextButton(
            modifier = Modifier
                .fillMaxHeight(0.95f)
                .buttonHold(
                    onPress = { eventSink(ButtonPress(player)) },
                    onRelease = { eventSink(ButtonRelease(player)) }
                ),
            icon = Icons.Default.MoveUp,
            text = "$playerName Riding",
            colors = ButtonDefaults.buttonColors(containerColor = color),
            onClick = {/* handled in .buttonHold*/ }
        )
    }
}

@Preview
@Composable
private fun RideTimeContentPreview() {
    RideTimeContent(
        state = RideTimeState(
            activeRidingCompetitor = null,
            matName = "Bay JJ",
            redTime = "1:23",
            blueTime = "0:22",
            eventSink = { },
        ),
        modifier = Modifier
    )
}
