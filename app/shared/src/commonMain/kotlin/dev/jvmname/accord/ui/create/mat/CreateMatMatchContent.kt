package dev.jvmname.accord.ui.create.mat

import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
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
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.ImeAction
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

        BoxWithConstraints(
            modifier = modifier
                .fillMaxSize()
                .padding(padding),
            contentAlignment = Alignment.TopCenter,
        ) {
            val isTablet = maxWidth >= 600.dp
            val isCompact = maxHeight < 670.dp
            val verticalPadding = if (isCompact) 12.dp else if (isTablet) 64.dp else 32.dp
            val sectionSpacing = if (isCompact) 8.dp else if (isTablet) 24.dp else 16.dp

            val redNameState = rememberTextFieldState()
            val blueNameState = rememberTextFieldState()
            var judgeCount by remember { mutableIntStateOf(3) }
            var matNumber by remember { mutableIntStateOf(1) }

            fun submitForm() {
                state.eventSink(
                    CreateMatMatchEvent.CreateMat(
                        matName = "Mat $matNumber",
                        judgeCount = judgeCount,
                        redName = redNameState.text.toString().ifBlank { "Orange" },
                        blueName = blueNameState.text.toString().ifBlank { "Green" },
                    )
                )
            }

            Column(
                modifier = Modifier
                    .widthIn(max = 480.dp)
                    .fillMaxWidth()
                    .padding(vertical = verticalPadding, horizontal = 16.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text(
                    "Create a Mat + Match", style = AccordTypography.displayMedium,
                    modifier = Modifier.combinedClickable(
                        onLongClick = { state.eventSink(CreateMatMatchEvent.LongClick) },
                        onClick = {}
                    ))

                Spacer(Modifier.height(sectionSpacing * 2))

                MatNumberSelector(matNumber) { matNumber = it }

                Spacer(Modifier.height(sectionSpacing))

                JudgeCountEditText(judgeCount) { judgeCount = it }

                Spacer(Modifier.height(sectionSpacing))


                CompetitorEditText(
                    competitor = Competitor.Orange,
                    state = redNameState,
                    imeAction = ImeAction.Next,
                    modifier = Modifier.fillMaxWidth(),
                )

                Spacer(Modifier.height(sectionSpacing))

                CompetitorEditText(
                    competitor = Competitor.Green,
                    state = blueNameState,
                    imeAction = ImeAction.Done,
                    modifier = Modifier.fillMaxWidth(),
                    onKeyboardAction = { submitForm() },
                )

                Spacer(Modifier.height(if (isCompact) 24.dp else if (isTablet) 80.dp else 64.dp))

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
                    onClick = { submitForm() },
                )
            }
        }
    }

}

@Composable
private fun MatNumberSelector(matNumber: Int, onMatNumberChange: (Int) -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(32.dp, Alignment.CenterHorizontally),
    ) {
        Text("Mat #:", style = AccordTypography.titleLarge)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            for (n in 1..3) {
                if (matNumber == n) {
                    FilledIconButton(onClick = {}) { Text(n.toString()) }
                } else {
                    OutlinedIconButton(onClick = { onMatNumberChange(n) }) { Text(n.toString()) }
                }
            }
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
        horizontalArrangement = Arrangement.spacedBy(12.dp, Alignment.CenterHorizontally)
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
            modifier = Modifier.width(120.dp),
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
                imeAction = ImeAction.Next
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
@Preview(device = "spec:width=1429dp,height=857dp,dpi=224,isRound=false,orientation=landscape")
@Preview(device = "spec:width=1429dp,height=589dp,dpi=224,isRound=false,orientation=landscape")
@Composable
private fun CreateMatMatchContentPreview() {
    AccordTheme {
        CreateMatMatchContent(CreateMatMatchState(false, null, {}), Modifier)
    }
}

@Preview
@Preview(device = "spec:width=1429dp,height=857dp,dpi=224,isRound=false,orientation=landscape")
@Preview(device = "spec:width=1429dp,height=589dp,dpi=224,isRound=false,orientation=landscape")
@Composable
private fun CreateMatMatchContentLoadingPreview() {
    AccordTheme {
        CreateMatMatchContent(CreateMatMatchState(true, null, {}), Modifier)
    }
}


