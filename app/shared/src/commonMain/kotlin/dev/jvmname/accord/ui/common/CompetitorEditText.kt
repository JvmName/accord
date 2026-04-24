package dev.jvmname.accord.ui.common

import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.text.input.TextFieldLineLimits
import androidx.compose.foundation.text.input.TextFieldState
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import dev.jvmname.accord.domain.Competitor
import dev.jvmname.accord.domain.color
import dev.jvmname.accord.domain.colorDark
import dev.jvmname.accord.domain.colorLight
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
    OutlinedTextField(
        state = state,
        modifier = modifier,
        label = { Text("${competitor.nameStr} Competitor (optional)") },
        placeholder = { Text(competitor.nameStr) },
        isError = isError,
        supportingText = null,
        lineLimits = TextFieldLineLimits.SingleLine,
        keyboardOptions = KeyboardOptions.Default.copy(
            capitalization = KeyboardCapitalization.Words,
            imeAction = imeAction,
        ),
        onKeyboardAction = { default -> onKeyboardAction?.invoke() ?: default() },
        colors = OutlinedTextFieldDefaults.colors(
            focusedBorderColor = competitor.colorDark,
            unfocusedBorderColor = competitor.colorLight,
            focusedLabelColor = competitor.color,
            unfocusedLabelColor = competitor.color,
        ),
    )
}
