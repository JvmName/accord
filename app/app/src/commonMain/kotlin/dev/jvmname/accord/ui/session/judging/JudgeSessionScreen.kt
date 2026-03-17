package dev.jvmname.accord.ui.session.judging

import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.remember
import com.slack.circuit.runtime.CircuitUiEvent
import com.slack.circuit.runtime.CircuitUiState
import dev.drewhamilton.poko.Poko
import dev.jvmname.accord.domain.Competitor
import dev.jvmname.accord.domain.control.HapticEvent
import dev.jvmname.accord.domain.control.rounds.RoundEvent
import dev.jvmname.accord.domain.control.rounds.RoundEvent.RoundState
import dev.jvmname.accord.domain.control.rounds.RoundInfo
import dev.jvmname.accord.domain.control.score.Score
import dev.jvmname.accord.parcel.CommonParcelize
import dev.jvmname.accord.parcel.ParcelableScreen


enum class ControlTimeType { SOLO, CONSENSUS }

@CommonParcelize
data class JudgeSessionScreen(val type: ControlTimeType) : ParcelableScreen

@Stable
data class JudgeSessionState(
    val matName: String,
    val matchState: MatchState,
    val isMatchEnded: Boolean = false,
    val eventSink: (JudgeSessionEvent) -> Unit,
) : CircuitUiState

@Poko
class MatchState(
    val score: Score,
    val haptic: HapticEvent?,
    val roundInfo: RoundEvent?,
)

sealed interface JudgeSessionEvent : CircuitUiEvent {
    data object Back : JudgeSessionEvent
    data class ButtonPress(val competitor: Competitor) : JudgeSessionEvent
    data class ButtonRelease(val competitor: Competitor) : JudgeSessionEvent

    data class ManualPointEdit(val competitor: Competitor, val action: Action) : JudgeSessionEvent {
        enum class Action { INCREMENT, DECREMENT }
    }

    data object BeginNextRound : JudgeSessionEvent
    data object Resume : JudgeSessionEvent
    data object Pause : JudgeSessionEvent
    data object Submission : JudgeSessionEvent
    data object Reset : JudgeSessionEvent
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
fun JudgeSessionState.rememberControlActions(): RoundControlActions {
    val event = matchState.roundInfo
    val state = event?.state
    return remember(event?.roundNumber, event?.totalRounds, state, event?.round) {

        val isPaused = state == RoundState.PAUSED
        val isActive = state == RoundState.STARTED && event.round is RoundInfo.Round

        RoundControlActions(
            beginNextRound = { eventSink(JudgeSessionEvent.BeginNextRound) },
            resume = { eventSink(JudgeSessionEvent.Resume) }.takeIf { isPaused },
            pause = { eventSink(JudgeSessionEvent.Pause) }.takeIf { isActive },
            submission = { eventSink(JudgeSessionEvent.Submission) }.takeIf { isActive },
            reset = { eventSink(JudgeSessionEvent.Reset) }.takeIf { event != null }
        )
    }
}
