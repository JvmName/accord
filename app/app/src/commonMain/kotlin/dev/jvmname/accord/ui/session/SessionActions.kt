package dev.jvmname.accord.ui.session

import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import dev.jvmname.accord.domain.Competitor

typealias MatchAction = () -> Unit
operator fun MatchAction?.invoke() = this?.invoke()

@Stable
class MatchActions(
    val startRound: MatchAction? = null,
    val resume: MatchAction? = null,
    val pause: MatchAction? = null,
    val endRound: MatchAction? = null,
    val reset: MatchAction? = null,
    val manualEdit: ((Competitor, ManualEditAction) -> Unit)? = null,
)

@Composable
fun rememberMatchActions(
    isActive: Boolean,
    isPaused: Boolean,
    hasRound: Boolean,
    onPause: () -> Unit,
    onResume: () -> Unit,
    onStartRound: () -> Unit,
    onEndRound: () -> Unit,
    onReset: (() -> Unit)? = null,
    onManualEdit: ((Competitor, ManualEditAction) -> Unit)? = null,
): MatchActions {
    val onPauseState = rememberUpdatedState(onPause)
    val onResumeState = rememberUpdatedState(onResume)
    val onStartState = rememberUpdatedState(onStartRound)
    val onEndState = rememberUpdatedState(onEndRound)
    val onResetState = rememberUpdatedState(onReset)
    val onManualEditState = rememberUpdatedState(onManualEdit)

    return remember(isActive, isPaused, hasRound) {
        MatchActions(
            startRound = { onStartState.value() },
            resume = { onResumeState.value() }.takeIf { isPaused },
            pause = { onPauseState.value() }.takeIf { isActive },
            endRound = { onEndState.value() }.takeIf { isActive },
            reset = { onResetState.value?.invoke() ?: Unit }.takeIf { hasRound },
            manualEdit = onManualEditState.value?.let { fn -> { c, a -> fn(c, a) } },
        )
    }
}
