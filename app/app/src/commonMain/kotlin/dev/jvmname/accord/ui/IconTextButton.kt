package dev.jvmname.accord.ui

import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ButtonColors
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp

@Composable
fun IconTextButton(
    modifier: Modifier,
    icon: ImageVector,
    text: String,
    colors: ButtonColors = ButtonDefaults.filledTonalButtonColors(),
    onClick: () -> Unit
) {
    FilledTonalButton(
        modifier = modifier.size(250.dp, ButtonDefaults.MinHeight + 15.dp),
        onClick = onClick,
        colors = colors,
        shape = RoundedCornerShape(10.dp)
    ) {
        Icon(icon, contentDescription = "")
        Spacer(modifier.width(6.dp))
        Text(text, style = MaterialTheme.typography.bodyLarge)
    }
}