package dev.jvmname.accord.ui.theme

import android.os.Build
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.ProvidedValue
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalInspectionMode
import dev.jvmname.accord.di.LocalPlatformContext

@Composable
actual fun AccordTheme(
    darkTheme: Boolean,
    dynamicColor: Boolean,
    content: @Composable () -> Unit,
) {
    val colorScheme = when {
        dynamicColor && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S -> {
            val context = LocalContext.current
            if (darkTheme) dynamicDarkColorScheme(context) else dynamicLightColorScheme(context)
        }

        darkTheme -> darkScheme
        else -> lightScheme
    }

    val clps = if (LocalInspectionMode.current) {
        arrayOf(
            LocalPlatformContext provides LocalContext.current
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