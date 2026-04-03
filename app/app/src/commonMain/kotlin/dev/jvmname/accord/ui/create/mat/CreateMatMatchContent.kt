package dev.jvmname.accord.ui.create.mat

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
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedIconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
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
import dev.jvmname.accord.domain.Competitor
import dev.jvmname.accord.ui.common.CompetitorEditText
import dev.jvmname.accord.ui.common.LocalCoroutineScope
import dev.jvmname.accord.ui.common.LocalSnackbarHostState
import dev.jvmname.accord.ui.common.StandardScaffold
import dev.jvmname.accord.ui.create.mat.CreateMatMatchEvent.Back
import dev.jvmname.accord.ui.theme.AccordTheme
import dev.jvmname.accord.ui.theme.AccordTypography
import dev.zacsweers.metro.AppScope
import kotlinx.coroutines.launch

@[Composable CircuitInject(CreateMatMatchScreen::class, AppScope::class)]
fun CreateMatMatchContent(state: CreateMatMatchState, modifier: Modifier) {
    StandardScaffold(
        modifier = modifier.fillMaxSize(),
        title = "Create Mat",
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
            val masterNameState = rememberTextFieldState()
            val matNameState = rememberTextFieldState()
            val redNameState = rememberTextFieldState()
            val blueNameState = rememberTextFieldState()
            var judgeCount by remember { mutableIntStateOf(1) }
            var isJudging by remember { mutableStateOf(false) }
            var hasAttemptedSubmit by remember { mutableStateOf(false) }

            val masterNameError = hasAttemptedSubmit && masterNameState.text.isBlank()
            val matNameError = hasAttemptedSubmit && matNameState.text.isBlank()
            val redNameError = hasAttemptedSubmit && redNameState.text.isBlank()
            val blueNameError = hasAttemptedSubmit && blueNameState.text.isBlank()

            Text("Mat Info", style = AccordTypography.titleLarge)

            Spacer(Modifier.height(16.dp))

            OutlinedTextField(
                masterNameState,
                modifier = Modifier.fillMaxWidth(),
                placeholder = { Text("Jane Smith") },
                label = { Text("Your Name *") },
                isError = masterNameError,
                supportingText = if (masterNameError) { { Text("Required") } } else null,
                lineLimits = TextFieldLineLimits.SingleLine,
                keyboardOptions = KeyboardOptions.Default.copy(
                    capitalization = KeyboardCapitalization.Words,
                    imeAction = ImeAction.Next,
                ),
            )

            Spacer(Modifier.height(16.dp))

            OutlinedTextField(
                matNameState,
                modifier = Modifier.fillMaxWidth(),
                placeholder = { Text("Mat #1") },
                label = { Text("Mat Name *") },
                isError = matNameError,
                supportingText = if (matNameError) { { Text("Required") } } else null,
                lineLimits = TextFieldLineLimits.SingleLine,
                keyboardOptions = KeyboardOptions.Default.copy(
                    capitalization = KeyboardCapitalization.Words,
                    imeAction = ImeAction.Next,
                ),
            )

            Spacer(Modifier.height(16.dp))


            JudgeCountEditText(judgeCount) { judgeCount = it }

            Spacer(Modifier.height(16.dp))

            Text("Match Info", style = AccordTypography.titleLarge)

            Spacer(Modifier.height(16.dp))

            CompetitorEditText(
                competitor = Competitor.RED,
                state = redNameState,
                imeAction = ImeAction.Next,
                modifier = Modifier.fillMaxWidth(),
                isError = redNameError,
            )

            Spacer(Modifier.height(16.dp))

            CompetitorEditText(
                competitor = Competitor.BLUE,
                state = blueNameState,
                imeAction = ImeAction.Done,
                modifier = Modifier.fillMaxWidth(),
                isError = blueNameError,
            )

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
                    hasAttemptedSubmit = true
                    if (masterNameState.text.isBlank() || matNameState.text.isBlank() ||
                        redNameState.text.isBlank() || blueNameState.text.isBlank()
                    ) return@Button
                    state.eventSink(
                        CreateMatMatchEvent.CreateMat(
                            masterName = masterNameState.text.toString(),
                            matName = matNameState.text.toString(),
                            judgeCount = judgeCount,
                            redName = redNameState.text.toString(),
                            blueName = blueNameState.text.toString(),
//                            isJudging = isJudging,
                        )
                    )
                }
            )
        }
    }

}

@Composable
private fun JudgeCountEditText(judgeCount: Int, onJudgeCountChange: (count: Int) -> Unit) {
    val textState = rememberTextFieldState(judgeCount.toString())
    LaunchedEffect(judgeCount) {
        textState.edit { replace(0, length, judgeCount.toString()) }
    }
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        OutlinedIconButton(
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
private fun CreateMatMatchContentPreview() {
    AccordTheme {
        CreateMatMatchContent(CreateMatMatchState(false, null, {}), Modifier)
    }
}

@Preview
@Composable
private fun CreateMatMatchContentLoadingPreview() {
    AccordTheme {
        CreateMatMatchContent(CreateMatMatchState(true, null, {}), Modifier)
    }
}


