package dev.jvmname.accord.ui.showcodes

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.slack.circuit.codegen.annotations.CircuitInject
import dev.jvmname.accord.network.User
import dev.jvmname.accord.network.UserId
import dev.jvmname.accord.ui.common.StandardScaffold
import dev.jvmname.accord.ui.theme.AccordTheme
import dev.jvmname.accord.ui.theme.wordChipColors
import dev.zacsweers.metro.AppScope

@[Composable CircuitInject(ShowCodesScreen::class, AppScope::class)]
fun ShowCodesContent(state: ShowCodesState, modifier: Modifier = Modifier) {
    StandardScaffold(
        modifier = modifier.fillMaxSize(),
        title = "Join Codes",
        onBackClick = { state.eventSink(ShowCodesEvent.Back) },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(16.dp),
        ) {

            Text(
                text = "Judges",
                style = MaterialTheme.typography.titleMedium,
            )
            Spacer(Modifier.height(8.dp))
            WordCodeRow(code = state.adminCode)

            Spacer(Modifier.height(24.dp))

            Text(
                text = "Viewers",
                style = MaterialTheme.typography.titleMedium,
            )
            Spacer(Modifier.height(8.dp))
            WordCodeRow(code = state.viewerCode)

            Spacer(Modifier.height(32.dp))

            Text(
                text = "Judges joined: ${state.joinedJudges.size}",
                style = MaterialTheme.typography.titleMedium,
            )

            Spacer(Modifier.height(32.dp))

            Button(
                modifier = Modifier.fillMaxWidth(),
                onClick = { state.eventSink(ShowCodesEvent.Ready) },
            ) {
                Text("Ready – Start Session")
            }
        }
    }
}

@Composable
private fun WordCodeRow(code: String?) {
    if (code.isNullOrBlank()) {
        Text("Code unavailable")
        return
    }

    val words = code.split(".")
    val chipColors = wordChipColors()
    FlowRow(
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
        itemVerticalAlignment = Alignment.CenterVertically,
    ) {
        words.forEachIndexed { index, word ->
            Card(
                elevation = CardDefaults.cardElevation(2.dp),
                colors = CardDefaults.cardColors(containerColor = chipColors[index % chipColors.size]),
            ) {
                Text(
                    text = word,
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 14.dp),
                )
            }
            if (index < words.lastIndex) {
                Text(
                    text = ".",
                    style = MaterialTheme.typography.displaySmall,
                    fontWeight = FontWeight.ExtraBold,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}


@Preview
@Composable
private fun ShowCodesContentPreview() {
    AccordTheme {
        ShowCodesContent(
            state = ShowCodesState(
                adminCode = "scuba.horse.bicycle.stapler",
                viewerCode = "battery.horse.stapler",
                joinedJudges = listOf(User(UserId("j1"), "Charlie")),
                eventSink = {},
            ),
        )
    }
}
