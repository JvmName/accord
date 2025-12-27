package dev.jvmname.accord.ui.create_mat

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.text.input.InputTransformation
import androidx.compose.foundation.text.input.TextFieldLineLimits
import androidx.compose.foundation.text.input.byValue
import androidx.compose.foundation.text.input.rememberTextFieldState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedIconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.slack.circuit.codegen.annotations.CircuitInject
import dev.jvmname.accord.ui.LocalCoroutineScope
import dev.jvmname.accord.ui.LocalSnackbarHostState
import dev.jvmname.accord.ui.StandardScaffold
import dev.jvmname.accord.ui.create_mat.CreateMatEvent.Back
import dev.jvmname.accord.ui.theme.AccordTheme
import dev.jvmname.accord.ui.theme.AccordTypography
import dev.zacsweers.metro.AppScope
import kotlinx.coroutines.launch

@[Composable CircuitInject(CreateMatScreen::class, AppScope::class)]
fun CreateMatContent(state: CreateMatState, modifier: Modifier) {
    StandardScaffold(
        modifier = modifier.fillMaxSize(),
        onBackClick = { state.eventSink(Back) },
    ) { padding ->
        state.error?.let {
            val snackbar = LocalSnackbarHostState.current
            LocalCoroutineScope.current.launch {
                snackbar.showSnackbar(it)
            }
        }

        Column(
            modifier = modifier
                .fillMaxSize()
                .padding(padding)
                .padding(vertical = 32.dp, horizontal = 16.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            val textState = rememberTextFieldState()
            var judgeCount by remember { mutableIntStateOf(1) }

            OutlinedTextField(
                textState,
                modifier = Modifier.fillMaxWidth(),
                placeholder = { Text("Mat #1") },
                label = { Text("Mat Name") },
                lineLimits = TextFieldLineLimits.SingleLine,
                keyboardOptions = KeyboardOptions.Default.copy(
                    capitalization = KeyboardCapitalization.Words
                ),
            )

            Spacer(Modifier.height(48.dp))

            JudgeCountEditText(judgeCount) { judgeCount = it }

            Spacer(Modifier.height(64.dp))

            Button(
                modifier = Modifier.fillMaxWidth(),
                content = {
                    if (state.loading) {
                        CircularProgressIndicator(
                            modifier = Modifier.height(ButtonDefaults.MinHeight),
                            color = MaterialTheme.colorScheme.onPrimary,
                            trackColor = MaterialTheme.colorScheme.onPrimaryContainer
                        )
                    } else {
                        Text("Create", style = AccordTypography.labelLarge)
                    }
                },
                onClick = {
                    state.eventSink(CreateMatEvent.CreateMat(textState.text.toString(), judgeCount))
                }
            )
        }
    }

}

@Composable
private fun JudgeCountEditText(judgeCount: Int, onJudgeCountChange: (count: Int) -> Unit) {
    val textState = rememberTextFieldState(judgeCount.toString())
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        FilledIconButton(
            modifier = Modifier.padding(top = 6.dp),
            onClick = { if (judgeCount > 1) onJudgeCountChange(judgeCount - 1) },
            enabled = judgeCount > 1
        ) {
            Icon(Icons.Default.Remove, contentDescription = "Decrease judge count")
        }

        OutlinedTextField(
            label = { Text("# Judges") },
            state = textState,
            modifier = Modifier.weight(1f),
            lineLimits = TextFieldLineLimits.SingleLine,
            inputTransformation = InputTransformation.byValue { current, proposed ->
                proposed.toString()
                    .toIntOrNull()
                    ?.takeIf { it in 1..3 }
                    ?.toString()
                    ?: current
            },
            keyboardOptions = KeyboardOptions(
                keyboardType = KeyboardType.Number,
                imeAction = ImeAction.Done
            ),
        )

        OutlinedIconButton(
            modifier = Modifier.padding(top = 6.dp),
            onClick = { if (judgeCount < 3) onJudgeCountChange(judgeCount + 1) },
            enabled = judgeCount < 3
        ) {
            Icon(Icons.Default.Add, contentDescription = "Increase judge count")
        }
    }
}

@Preview
@Composable
private fun CreateMatContentPreview() {
    AccordTheme {
        CreateMatContent(CreateMatState(false, null, {}), Modifier)
    }
}

@Preview
@Composable
private fun CreateMatContentLoadingPreview() {
    AccordTheme {
        CreateMatContent(CreateMatState(true, null, {}), Modifier)
    }
}

