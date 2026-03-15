package dev.jvmname.accord.ui.create.newmatch

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.text.input.rememberTextFieldState
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.slack.circuit.codegen.annotations.CircuitInject
import dev.jvmname.accord.ui.common.StandardScaffold
import dev.jvmname.accord.ui.theme.AccordTheme
import dev.zacsweers.metro.AppScope

@[Composable CircuitInject(NewMatchScreen::class, AppScope::class)]
fun NewMatchContent(state: NewMatchState, modifier: Modifier = Modifier) {
    StandardScaffold(
        title = "New Match — ${state.matName}",
        onBackClick = { state.eventSink(NewMatchEvent.Back) },
        modifier = modifier.fillMaxSize(),
    ) { padding ->
        Column(
            modifier = Modifier
                .padding(padding)
                .padding(16.dp)
                .fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            val redState = rememberTextFieldState()
            val blueState = rememberTextFieldState()

            OutlinedTextField(
                state = redState,
                label = { Text("Red Corner") },
                placeholder = { Text("Competitor name") },
                keyboardOptions = KeyboardOptions(
                    capitalization = KeyboardCapitalization.Words,
                    imeAction = ImeAction.Next
                ),
                modifier = Modifier.fillMaxWidth(),
            )

            OutlinedTextField(
                state = blueState,
                label = { Text("Blue Corner") },
                placeholder = { Text("Competitor name") },
                keyboardOptions = KeyboardOptions(
                    capitalization = KeyboardCapitalization.Words,
                    imeAction = ImeAction.Done
                ),
                modifier = Modifier.fillMaxWidth(),
            )

            Button(
                onClick = {
                    state.eventSink(
                        NewMatchEvent.CreateMatch(
                            redName = redState.text.toString(),
                            blueName = blueState.text.toString()
                        )
                    )
                },
                modifier = Modifier.fillMaxWidth(),
                enabled = !state.loading,
            ) {
                if (state.loading) {
                    CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                } else {
                    Text("Create Match")
                }
            }

            state.error?.let {
                Text(
                    text = it,
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodySmall,
                )
            }
        }
    }
}

@Preview
@Composable
private fun NewMatchContentPreview() {
    AccordTheme {
        NewMatchContent(NewMatchState(matName = "Mat 1", loading = false, error = null, eventSink = {}))
    }
}
