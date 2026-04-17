package dev.jvmname.accord.ui.common

import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.waitForUpOrCancellation
import androidx.compose.foundation.indication
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.PressInteraction
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.requiredWidth
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Create
import androidx.compose.material.icons.filled.MoveUp
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonColors
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.ripple
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.jvmname.accord.domain.Competitor
import dev.jvmname.accord.domain.color
import dev.jvmname.accord.domain.nameStr
import dev.jvmname.accord.ui.theme.AccordTheme
import kotlinx.coroutines.launch

private val ButtonShape = RoundedCornerShape(10.dp)
private val ButtonHeight = ButtonDefaults.MinHeight + 15.dp

@Composable
fun IconTextButton(
    modifier: Modifier = Modifier,
    icon: ImageVector?,
    text: String,
    colors: ButtonColors = ButtonDefaults.buttonColors(),
    onClick: () -> Unit,
) {
    Button(
        modifier = Modifier.height(ButtonHeight) then modifier,
        onClick = onClick,
        colors = colors,
        shape = ButtonShape
    ) {
        icon?.let {
            Icon(it, contentDescription = "")
        }
        Text(
            text,
            style = MaterialTheme.typography.bodyLarge.copy(fontSize = 22.sp),
            modifier = Modifier.padding(start = 6.dp)
        )
    }
}

@Composable
fun HoldingButton(
    modifier: Modifier = Modifier,
    icon: ImageVector?,
    text: String,
    containerColor: Color = ButtonDefaults.buttonColors().containerColor,
    contentColor: Color = ButtonDefaults.buttonColors().contentColor,
    onPress: () -> Unit,
    onRelease: () -> Unit,
) {
    val interactionSource = remember { MutableInteractionSource() }
    val scope = rememberCoroutineScope()
    val currentOnPress by rememberUpdatedState(onPress)
    val currentOnRelease by rememberUpdatedState(onRelease)

    Surface(
        modifier = Modifier.height(ButtonHeight) then modifier
            .indication(interactionSource, ripple())
            .pointerInput(Unit) {
                awaitEachGesture {
                    val down = awaitFirstDown(requireUnconsumed = false).also {
                        it.consume()
                    }
                    val press = PressInteraction.Press(down.position)
                    scope.launch { interactionSource.emit(press) }
                    currentOnPress()

                    waitForUpOrCancellation()?.also { it.consume() }
                    scope.launch { interactionSource.emit(PressInteraction.Release(press)) }
                    currentOnRelease()
                }
            },
        shape = ButtonShape,
        color = containerColor,
        contentColor = contentColor,
    ) {
        Box(contentAlignment = Alignment.Center) {
            CompositionLocalProvider(LocalContentColor provides contentColor) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.Center,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)
                ) {
                    icon?.let {
                        Icon(it, contentDescription = "")
                    }
                    Text(
                        text,
                        style = MaterialTheme.typography.bodyLarge,
                        modifier = Modifier.padding(start = 6.dp)
                    )
                }
            }
        }
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

@Preview
@Composable
private fun HoldingButtonPreview() {
    AccordTheme {
        Column(
            Modifier.fillMaxSize(),
            verticalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            HoldingButton(
                modifier = Modifier.fillMaxWidth(),
                icon = Icons.Default.MoveUp,
                text = "${Competitor.Orange.nameStr} controlling",
                containerColor = Competitor.Orange.color,
                onPress = {},
                onRelease = {}
            )
        }
    }
}
