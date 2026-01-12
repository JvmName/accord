package dev.jvmname.accord.di

import androidx.compose.runtime.compositionLocalOf

expect abstract class PlatformContext

 val LocalPlatformContext = compositionLocalOf<PlatformContext> {
    error("No SnackbarHostState")
}