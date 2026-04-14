package dev.jvmname.accord.ui.session.master

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
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
import com.slack.circuit.overlay.OverlayNavigator
import dev.jvmname.accord.domain.Competitor
import dev.jvmname.accord.domain.asEmoji
import dev.jvmname.accord.domain.color
import dev.jvmname.accord.domain.nameStr
import dev.jvmname.accord.ui.theme.AccordTheme

internal sealed class SubmissionResult {
    data object Dismissed : SubmissionResult()
    data class Confirmed(
        val winner: Competitor?,
        val stoppage: Boolean,
    ) : SubmissionResult()

    companion object
}

private enum class EndRoundMethod { SUBMISSION, STOPPAGE }

@Composable
internal fun SubmissionDialog(overlayNavigator: OverlayNavigator<SubmissionResult>) {
    var method by remember { mutableStateOf(EndRoundMethod.SUBMISSION) }
    var selected by remember { mutableStateOf<Competitor?>(null) }

    Column(
        modifier = Modifier.fillMaxWidth().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(
            "End Round",
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.padding(bottom = 4.dp),
        )
        SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
            EndRoundMethod.entries.forEachIndexed { index, m ->
                SegmentedButton(
                    shape = SegmentedButtonDefaults.itemShape(index, 2),
                    onClick = {
                        method = m
                        selected = null
                    },
                    selected = method == m,
                    label = { Text(m.name.lowercase().replaceFirstChar { it.uppercase() }) },
                )
            }
        }
        Text(
            text = "Who won this round?",
            style = MaterialTheme.typography.bodyMedium,
        )
        SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
            Competitor.entries.forEachIndexed { index, competitor ->
                SegmentedButton(
                    shape = SegmentedButtonDefaults.itemShape(index, 2),
                    border = SegmentedButtonDefaults.borderStroke(competitor.color),
                    onClick = { selected = competitor },
                    selected = competitor == selected,
                    colors = SegmentedButtonDefaults.colors(
                        activeContainerColor = competitor.color,
                        activeContentColor = Color.White,
                    ),
                    label = { Text(competitor.nameStr) }
                )
            }
        }
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.End,
        ) {
            TextButton(onClick = { overlayNavigator.finish(SubmissionResult.Dismissed) }) { Text("Cancel") }
            TextButton(onClick = {
                overlayNavigator.finish(
                    SubmissionResult.Confirmed(
                        winner = selected,
                        stoppage = method == EndRoundMethod.STOPPAGE
                    )
                )
            }) { Text("Confirm") }
        }
    }
}

@Composable
internal fun RoundScoresSheet(
    rounds: List<RoundDisplayInfo>,
    redName: String,
    blueName: String,
) {
    Column(modifier = Modifier.fillMaxWidth().padding(16.dp)) {
        Text(
            "Round Results",
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.padding(bottom = 12.dp),
        )
        if (rounds.isEmpty()) {
            Text(
                "No rounds yet",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        } else {
            LazyColumn(verticalArrangement = Arrangement.spacedBy(0.dp)) {
                items(rounds) { round ->
                    RoundRow(round = round, redName = redName, blueName = blueName)
                    if (round != rounds.last()) HorizontalDivider()
                }
            }
        }
    }
}

@Composable
internal fun RoundRow(round: RoundDisplayInfo, redName: String, blueName: String) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 12.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            "Round ${round.roundNumber}",
            style = MaterialTheme.typography.bodyLarge,
            fontWeight = FontWeight.Medium,
        )
        if (round.isInProgress) {
            Text(
                "⏳ In Progress",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        } else {
            val (emoji, name) = when (round.winner) {
                Competitor.RED -> round.winner.asEmoji to redName
                Competitor.BLUE -> round.winner.asEmoji to blueName
                null -> "—" to "Tie"
            }
            Text(
                "$emoji $name (${round.redScore}:${round.blueScore})",
                style = MaterialTheme.typography.bodyMedium,
            )
        }
    }
}

@Preview
@Composable
private fun RoundScoresSheet_Preview() {
    AccordTheme {
        RoundScoresSheet(
            rounds = listOf(
                RoundDisplayInfo(1, false, Competitor.RED, 12, 4),
                RoundDisplayInfo(2, false, Competitor.BLUE, 3, 18),
                RoundDisplayInfo(3, true, null, 0, 0),
            ),
            redName = "Alice",
            blueName = "Bob",
        )
    }
}

@Preview
@Composable
private fun SubmissionDialogPreview() {
    AccordTheme {
        SubmissionDialog(overlayNavigator = { })
    }
}