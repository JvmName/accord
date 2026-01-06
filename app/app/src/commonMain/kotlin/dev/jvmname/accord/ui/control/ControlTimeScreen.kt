package dev.jvmname.accord.ui.control

import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.remember
import com.slack.circuit.runtime.CircuitUiEvent
import com.slack.circuit.runtime.CircuitUiState
import com.slack.circuit.runtime.screen.Screen
import dev.drewhamilton.poko.Poko
import dev.jvmname.accord.domain.Competitor
import dev.jvmname.accord.domain.control.BaseRound
import dev.jvmname.accord.domain.control.HapticEvent
import dev.jvmname.accord.domain.control.RoundEvent
import dev.jvmname.accord.domain.control.RoundEvent.RoundState
import dev.jvmname.accord.domain.control.Score
import dev.jvmname.accord.parcel.CommonParcelize


enum class ControlTimeType { SOLO, CONSENSUS }

@CommonParcelize
data class ControlTimeScreen(val type: ControlTimeType) : Screen

@Stable
data class ControlTimeState(
    val matName: String,
    val matchState: MatchState,
    val eventSink: (ControlTimeEvent) -> Unit,
) : CircuitUiState

@Poko
class MatchState(
    val score: Score,
    val haptic: HapticEvent?,
    val roundInfo: RoundEvent?,
)

sealed interface ControlTimeEvent : CircuitUiEvent {
    data object Back : ControlTimeEvent
    data class ButtonPress(val competitor: Competitor) : ControlTimeEvent
    data class ButtonRelease(val competitor: Competitor) : ControlTimeEvent

    data class ManualPointEdit(val competitor: Competitor, val action: Action) : ControlTimeEvent {
        enum class Action { INCREMENT, DECREMENT }
    }

    data object BeginNextRound : ControlTimeEvent
    data object Resume : ControlTimeEvent
    data object Pause : ControlTimeEvent
    data object Submission : ControlTimeEvent
    data object Reset : ControlTimeEvent
}

@Poko
class RoundControlActions(
    val beginNextRound: (() -> Unit)? = null,
    val resume: (() -> Unit)? = null,
    val pause: (() -> Unit)? = null,
    val submission: (() -> Unit)? = null,
    val reset: (() -> Unit)? = null,
)

@Composable
fun ControlTimeState.rememberControlActions(): RoundControlActions {
    val event = matchState.roundInfo
    val state = event?.state
    return remember(event?.roundNumber, event?.totalRounds, state, event?.round) {

        val isPaused = state == RoundState.PAUSED
        val isActive = state == RoundState.STARTED && event.round is BaseRound.Round

        RoundControlActions(
            beginNextRound = { eventSink(ControlTimeEvent.BeginNextRound) },
            resume = { eventSink(ControlTimeEvent.Resume) }.takeIf { isPaused },
            pause = { eventSink(ControlTimeEvent.Pause) }.takeIf { isActive },
            submission = { eventSink(ControlTimeEvent.Submission) }.takeIf { isActive },
            reset = { eventSink(ControlTimeEvent.Reset) }.takeIf { event != null }
        )
    }
}
