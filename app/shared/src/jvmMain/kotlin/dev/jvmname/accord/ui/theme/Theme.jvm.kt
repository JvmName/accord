package dev.jvmname.accord.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.ProvidedValue
import androidx.compose.ui.platform.LocalInspectionMode
import dev.jvmname.accord.di.EmptyPlatformContext
import dev.jvmname.accord.di.LocalPlatformContext

@Composable
actual fun AccordTheme(
    darkTheme: Boolean,
    dynamicColor: Boolean,
    content: @Composable (() -> Unit),
) {
    val colorScheme =
        when {
            darkTheme -> darkScheme
            else -> lightScheme
        }

    val clps = if (LocalInspectionMode.current) {
        arrayOf(
            LocalPlatformContext provides EmptyPlatformContext
        )

    } else {
        emptyArray<ProvidedValue<*>>()

    }
    CompositionLocalProvider(*clps) {
        MaterialTheme(
            colorScheme = colorScheme,
            typography = AccordTypography,
            content = content
        )
    }
}