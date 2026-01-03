package dev.jvmname.accord.ui.control

import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.remember
import com.slack.circuit.runtime.CircuitUiEvent
import com.slack.circuit.runtime.CircuitUiState
import com.slack.circuit.runtime.screen.Screen
import dev.drewhamilton.poko.Poko
import dev.jvmname.accord.domain.Competitor
import dev.jvmname.accord.domain.control.HapticEvent
import dev.jvmname.accord.domain.control.RoundEvent
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
    val round = matchState.roundInfo
    val state = round?.state
    return remember(round?.roundNumber, round?.totalRounds, state) {

        val isNotStartedOrEnded = round == null || state == RoundEvent.RoundState.ENDED
        val isPaused = state == RoundEvent.RoundState.PAUSED
        val isActive = state == RoundEvent.RoundState.STARTED

        RoundControlActions(
            beginNextRound = if (isNotStartedOrEnded) {
                { eventSink(ControlTimeEvent.BeginNextRound) }
            } else null,
            resume = if (isPaused) {
                { eventSink(ControlTimeEvent.Resume) }
            } else null,
            pause = if (isActive) {
                { eventSink(ControlTimeEvent.Pause) }
            } else null,
            submission = if (isActive) {
                { eventSink(ControlTimeEvent.Submission) }
            } else null,
            reset = if (round != null) {
                { eventSink(ControlTimeEvent.Reset) }
            } else null
        )
    }
}
