package dev.jvmname.accord.ui.join

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.text.input.OutputTransformation
import androidx.compose.foundation.text.input.TextFieldBuffer
import androidx.compose.foundation.text.input.rememberTextFieldState
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.slack.circuit.codegen.annotations.CircuitInject
import com.slack.circuit.overlay.OverlayEffect
import com.slack.circuitx.overlays.BottomSheetOverlay
import dev.jvmname.accord.ui.common.StandardScaffold
import dev.jvmname.accord.ui.theme.AccordTheme
import dev.jvmname.accord.ui.theme.wordChipColors
import dev.zacsweers.metro.AppScope

@[Composable CircuitInject(JoinMatScreen::class, AppScope::class)]
fun JoinMatContent(state: JoinMatState, modifier: Modifier = Modifier) {
    StandardScaffold(
        title = "Join Mat",
        onBackClick = { state.eventSink(JoinMatEvent.Back) },
        modifier = modifier.fillMaxSize(),
    ) { padding ->


        state.error?.let { error ->
            OverlayEffect(state.error) {
                show(BottomSheetOverlay(model = Unit, onDismiss = {}) { _, _ ->
                    Column(modifier = Modifier.fillMaxWidth().padding(16.dp)) {
                        Text(
                            "Error joining mat",
                            style = MaterialTheme.typography.titleLarge,
                            fontWeight = FontWeight.SemiBold,
                            modifier = Modifier.padding(bottom = 12.dp),
                        )
                        Text(
                            error, style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }

                })
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
                outputTransformation = rememberChunkedCodeTransformation(),
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

@Composable
private fun rememberChunkedCodeTransformation(): OutputTransformation {
    val chipColors = wordChipColors()
    val dotColor = MaterialTheme.colorScheme.onSurfaceVariant
    return remember(chipColors, dotColor) { ChunkedCodeTransformation(chipColors, dotColor) }
}

private class ChunkedCodeTransformation(
    private val chipColors: List<Color>,
    private val dotColor: Color,
) : OutputTransformation {
    override fun TextFieldBuffer.transformOutput() {
        var start = 0
        var wordIndex = 0
        for (i in 0..length) {
            if (i == length || charAt(i) == '.') {
                if (i > start) {
                    addStyle(
                        SpanStyle(
                            background = chipColors[wordIndex % chipColors.size],
                            fontWeight = FontWeight.SemiBold,
                        ),
                        start, i,
                    )
                    wordIndex++
                }
                if (i < length) {
                    addStyle(SpanStyle(color = dotColor, fontWeight = FontWeight.Bold), i, i + 1)
                }
                start = i + 1
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
