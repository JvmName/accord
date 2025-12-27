package dev.jvmname.accord.ui

import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import kotlinx.coroutines.CoroutineScope

val LocalSnackbarHostState = compositionLocalOf<SnackbarHostState> {
    error("No SnackbarHostState")
}

val LocalCoroutineScope = compositionLocalOf<CoroutineScope> {
    error("No CoroutineScope found")
}

@Composable
fun StandardScaffold(modifier: Modifier = Modifier, content: @Composable (PaddingValues) -> Unit) {
    val scope = rememberCoroutineScope()
    val snackbarHostState = remember { SnackbarHostState() }
    CompositionLocalProvider(
        LocalSnackbarHostState provides snackbarHostState,
        LocalCoroutineScope provides scope
    ) {
        Scaffold(
            snackbarHost = { SnackbarHost(hostState = snackbarHostState) },
            content = content
        )
    }

}
