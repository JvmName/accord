package dev.jvmname.accord.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.RememberObserver
import com.github.michaelbull.result.Result
import com.github.michaelbull.result.annotation.UnsafeResultErrorAccess
import com.github.michaelbull.result.annotation.UnsafeResultValueAccess
import com.github.michaelbull.result.runCatching
import com.slack.circuit.retained.rememberRetained
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancel
import top.ltfan.multihaptic.HapticEffect
import top.ltfan.multihaptic.vibrator.Vibrator
import java.util.Locale
import kotlin.contracts.InvocationKind
import kotlin.contracts.contract

// https://chrisbanes.me/posts/retaining-beyond-viewmodels/
@Composable
fun rememberRetainedCoroutineScope(): CoroutineScope {
    return rememberRetained("coroutine_scope") {
        object : RememberObserver {
            val scope = CoroutineScope(Dispatchers.Main + Job())

            override fun onForgotten() {
                // We've been forgotten, cancel the CoroutineScope
                scope.cancel()
            }

            // Not called by Circuit
            override fun onAbandoned() = Unit

            // Nothing to do here
            override fun onRemembered() = Unit
        }
    }.scope
}

/** truly the dumbest thing I've needed to write; replaces [kotlin.text.capitalize]*/
fun String.capitalize(): String {
    return replaceFirstChar { if (it.isLowerCase()) it.titlecase(Locale.getDefault()) else "" }
}

inline fun <T> catchRunning(block: () -> T): Result<T, Throwable> = runCatching(block)

@OptIn(UnsafeResultValueAccess::class, UnsafeResultErrorAccess::class)
inline fun <T, E> Result<T, E>.onEither(
    success: (T) -> Unit,
    failure: (E) -> Unit,
): Result<T, E> {
    contract {
        callsInPlace(success, InvocationKind.AT_MOST_ONCE)
        callsInPlace(failure, InvocationKind.AT_MOST_ONCE)
    }
    when {
        isOk -> success(value)
        else -> failure(error)
    }
    return this
}

data object StubVibrator : Vibrator{
    override fun vibrate(effect: HapticEffect) {
    }

    override fun cancel() {
    }

}