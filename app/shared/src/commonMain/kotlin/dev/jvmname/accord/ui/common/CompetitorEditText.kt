package dev.jvmname.accord.ui.common

import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.text.input.TextFieldLineLimits
import androidx.compose.foundation.text.input.TextFieldState
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import dev.jvmname.accord.domain.Competitor
import dev.jvmname.accord.domain.nameStr

@Composable
fun CompetitorEditText(
    modifier: Modifier = Modifier,
    competitor: Competitor,
    state: TextFieldState,
    imeAction: ImeAction = ImeAction.Next,
    isError: Boolean = false,
    onKeyboardAction: (() -> Unit)? = null,
) {
    val (focusedBorder, unfocusedBorder, labelColor) = when (competitor) {
        Competitor.RED -> Triple(Color(0xFFD32F2F), Color(0xFFEF9A9A), Color.Red)
        Competitor.BLUE -> Triple(Color(0xFF1565C0), Color(0xFF90CAF9), Color.Blue)
    }
    OutlinedTextField(
        state = state,
        modifier = modifier,
        label = { Text("${competitor.nameStr} Competitor") },
        placeholder = { Text("Competitor name") },
        isError = isError,
        supportingText = if (isError) { { Text("Required") } } else null,
        lineLimits = TextFieldLineLimits.SingleLine,
        keyboardOptions = KeyboardOptions.Default.copy(
            capitalization = KeyboardCapitalization.Words,
            imeAction = imeAction,
        ),
        onKeyboardAction = { onKeyboardAction?.invoke() },
        colors = OutlinedTextFieldDefaults.colors(
            focusedBorderColor = focusedBorder,
            unfocusedBorderColor = unfocusedBorder,
            focusedLabelColor = labelColor,
            unfocusedLabelColor = labelColor,
        ),
    )
}
