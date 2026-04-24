package dev.jvmname.accord.ui.showcodes

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
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
import androidx.compose.ui.util.fastForEachIndexed
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

        BoxWithConstraints(
            modifier = modifier
                .fillMaxSize()
                .padding(padding),
            contentAlignment = Alignment.TopCenter,
        ) {
            val isTablet = maxWidth >= 600.dp
            val verticalPadding = if (isTablet) 64.dp else 32.dp
            val sectionSpacing = if (isTablet) 64.dp else 16.dp

            Column(
                modifier = Modifier
                    .widthIn(max = 480.dp)
                    .fillMaxWidth()
                    .padding(vertical = verticalPadding, horizontal = 16.dp),
            ) {

                Text(
                    text = "Judge Join Code",
                    style = MaterialTheme.typography.titleLarge,
                )
                Spacer(Modifier.height(sectionSpacing))
                WordCodeRow(code = state.adminCode, isTablet)


                Spacer(Modifier.height(sectionSpacing))

                Text(
                    text = "Judges joined: ${state.joinedJudges.size} / ${state.totalJudges} ${if (state.totalJudges == state.joinedJudges.size) "✅" else ""}",
                    style = MaterialTheme.typography.titleLarge,
                )

                Spacer(Modifier.height(64.dp))

                if (!state.embedded) {
                    Button(
                        modifier = Modifier.fillMaxWidth(),
                        onClick = { state.eventSink(ShowCodesEvent.Ready) },
                    ) {
                        Text("Ready – Start Session")
                    }
                }
            }
        }
    }
}

@Composable
private fun WordCodeRow(code: String?, isTablet: Boolean) {
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
        words.fastForEachIndexed { index, word ->
            Card(
                elevation = CardDefaults.cardElevation(2.dp),
                colors = CardDefaults.cardColors(containerColor = chipColors[index % chipColors.size]),
            ) {
                Text(
                    text = word,
                    style = if (isTablet) MaterialTheme.typography.headlineMedium else MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 14.dp),
                )
            }
            if (index < words.lastIndex) {
                Text(
                    text = ".",
                    style = if (isTablet) MaterialTheme.typography.displayMedium else MaterialTheme.typography.displaySmall,
                    fontWeight = FontWeight.ExtraBold,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}


@Preview
@Preview(device = "spec:width=1429dp,height=857dp,dpi=224,isRound=false,orientation=landscape")
@Composable
private fun ShowCodesContentPreview() {
    AccordTheme {
        ShowCodesContent(
            state = ShowCodesState(
                adminCode = "scuba.horse.bicycle.stapler",
                viewerCode = "battery.horse.stapler",
                joinedJudges = listOf(User(UserId("j1"), "Charlie")),
                totalJudges = 3,
                embedded = false,
                eventSink = {},
            ),
        )
    }
}
