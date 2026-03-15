package dev.jvmname.accord.ui.join

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
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.slack.circuit.codegen.annotations.CircuitInject
import dev.jvmname.accord.ui.common.LocalCoroutineScope
import dev.jvmname.accord.ui.common.LocalSnackbarHostState
import dev.jvmname.accord.ui.common.StandardScaffold
import dev.jvmname.accord.ui.theme.AccordTheme
import dev.zacsweers.metro.AppScope
import kotlinx.coroutines.launch

@[Composable CircuitInject(JoinMatScreen::class, AppScope::class)]
fun JoinMatContent(state: JoinMatState, modifier: Modifier = Modifier) {
    StandardScaffold(
        title = "Join Mat",
        onBackClick = { state.eventSink(JoinMatEvent.Back) },
        modifier = modifier.fillMaxSize(),
    ) { padding ->
        state.error?.let {
            val snackbar = LocalSnackbarHostState.current
            LocalCoroutineScope.current.launch {
                snackbar.showSnackbar(it)
            }
        }

        Column(
            modifier = Modifier
                .padding(padding)
                .padding(16.dp)
                .fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            val codeState = rememberTextFieldState()
            val nameState = rememberTextFieldState()

            OutlinedTextField(
                state = codeState,
                label = { Text("Join Code") },
                placeholder = { Text("word.word.word") },
                keyboardOptions = KeyboardOptions(
                    capitalization = KeyboardCapitalization.None,
                    imeAction = ImeAction.Next
                ),
                modifier = Modifier.fillMaxWidth(),
            )

            OutlinedTextField(
                state = nameState,
                label = { Text("Your Name") },
                placeholder = { Text("e.g. Jane") },
                keyboardOptions = KeyboardOptions(
                    capitalization = KeyboardCapitalization.Words,
                    imeAction = ImeAction.Done
                ),
                modifier = Modifier.fillMaxWidth(),
            )

            Button(
                onClick = {
                    state.eventSink(
                        JoinMatEvent.OnJoinCodeEntered(
                            codeState.text.toString(),
                            nameState.text.toString()
                        )
                    )
                },
                modifier = Modifier.fillMaxWidth(),
                enabled = !state.loading,
            ) {
                if (state.loading) {
                    CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                } else {
                    Text("Join")
                }
            }
        }
    }
}

@Preview
@Composable
private fun JoinMatContentPreview() {
    AccordTheme {
        JoinMatContent(JoinMatState(loading = false, error = null, eventSink = {}))
    }
}
