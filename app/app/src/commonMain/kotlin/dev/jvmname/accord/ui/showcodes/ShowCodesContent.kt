package dev.jvmname.accord.ui.showcodes

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
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
import dev.jvmname.accord.network.Mat
import dev.jvmname.accord.network.MatCode
import dev.jvmname.accord.network.MatId
import dev.jvmname.accord.network.Match
import dev.jvmname.accord.network.MatchId
import dev.jvmname.accord.network.Role
import dev.jvmname.accord.network.User
import dev.jvmname.accord.network.UserId
import dev.jvmname.accord.ui.common.StandardScaffold
import dev.jvmname.accord.ui.theme.AccordTheme
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
            val judgeCode = state.mat.codes.find { it.role == Role.ADMIN }?.code
            val viewerCode = state.mat.codes.find { it.role == Role.VIEWER }?.code

            Text(
                text = "Judges",
                style = MaterialTheme.typography.labelLarge,
            )
            Spacer(Modifier.height(8.dp))
            WordCodeRow(code = judgeCode)

            Spacer(Modifier.height(24.dp))

            Text(
                text = "Viewers",
                style = MaterialTheme.typography.labelLarge,
            )
            Spacer(Modifier.height(8.dp))
            WordCodeRow(code = viewerCode)

            Spacer(Modifier.height(32.dp))

            Button(
                modifier = Modifier.fillMaxWidth(),
                onClick = { state.eventSink(ShowCodesEvent.Ready) },
            ) {
                Text("Ready — Start Session")
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
    Row(
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        words.forEachIndexed { index, word ->
            Card(
                elevation = CardDefaults.cardElevation(2.dp),
            ) {
                Text(
                    text = word,
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 16.dp),
                )
            }
            if (index < words.lastIndex) {
                Text(
                    text = ".",
                    style = MaterialTheme.typography.titleLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Preview
@Composable
private fun ShowCodesContentPreview() {
    val mat = Mat(
        id = MatId("1"),
        name = "Morning BJJ",
        judgeCount = 3,
        creatorId = UserId("u1"),
        codes = listOf(
            MatCode("morning.coffee.bicycle", Role.ADMIN),
            MatCode("sunset.river.stone", Role.VIEWER),
        )
    )
    val match = Match(
        id = MatchId("m1"),
        creatorId = UserId("u1"),
        matId = MatId("1"),
        startedAt = null,
        endedAt = null,
        red = User(UserId("r1"), "Alice"),
        blue = User(UserId("b1"), "Bob"),
    )
    AccordTheme {
        ShowCodesContent(
            state = ShowCodesState(mat = mat, match = match, eventSink = {}),
        )
    }
}
