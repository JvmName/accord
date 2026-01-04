package dev.jvmname.accord.ui.common

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.requiredWidth
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Create
import androidx.compose.material3.ButtonColors
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import dev.jvmname.accord.ui.theme.AccordTheme

@Composable
fun IconTextButton(
    modifier: Modifier = Modifier,
    icon: ImageVector?,
    text: String,
    colors: ButtonColors = ButtonDefaults.filledTonalButtonColors(),
    onClick: () -> Unit,
) {
    FilledTonalButton(
        modifier = Modifier.size(250.dp, ButtonDefaults.MinHeight + 15.dp) then modifier,
        onClick = onClick,
        colors = colors,
        shape = RoundedCornerShape(10.dp)
    ) {
        icon?.let {
            Icon(it, contentDescription = "")
            Spacer(modifier.width(4.dp))
        }
        Text(text, style = MaterialTheme.typography.bodyLarge)
    }
}

@Preview
@Composable
private fun IconTextButtonPreview() {
    AccordTheme {
        Column(
            Modifier.fillMaxSize(),
            verticalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            IconTextButton(
                icon = Icons.Default.Create,
                text = "Create Mat",
                onClick = {}
            )

            IconTextButton(
                modifier = Modifier.fillMaxWidth(),
                icon = Icons.Default.Create,
                text = "Create Mat",
                onClick = {}
            )

            IconTextButton(
                modifier = Modifier.requiredWidth(124.dp),
                icon = Icons.Default.Create,
                text = "Create Mat",
                onClick = {}
            )
        }
    }
}
