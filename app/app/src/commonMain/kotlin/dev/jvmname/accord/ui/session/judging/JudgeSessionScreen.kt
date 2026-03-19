package dev.jvmname.accord.ui.session.judging

import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.remember
import com.slack.circuit.runtime.CircuitUiState
import dev.drewhamilton.poko.Poko
import dev.jvmname.accord.domain.control.HapticEvent
import dev.jvmname.accord.domain.control.rounds.RoundEvent
import dev.jvmname.accord.domain.control.rounds.RoundEvent.RoundState
import dev.jvmname.accord.domain.control.rounds.RoundInfo
import dev.jvmname.accord.domain.control.score.Score
import dev.jvmname.accord.parcel.CommonParcelize
import dev.jvmname.accord.parcel.ParcelableScreen
import dev.jvmname.accord.ui.session.JudgeSessionEvent


@CommonParcelize
data object JudgeSessionScreen : ParcelableScreen

@Stable
data class JudgeSessionState(
    val matName: String,
    val matchState: MatchState,
    val hapticEvent: HapticEvent? = null,
    val isMatchEnded: Boolean = false,
    val eventSink: (JudgeSessionEvent) -> Unit,
) : CircuitUiState

@Poko
class MatchState(
    val score: Score,
    val roundInfo: RoundEvent?,
)

typealias MatchAction = () -> Unit

@Poko
class MatchActions(
    val startRound: MatchAction? = null,
    val resume: MatchAction? = null,
    val pause: MatchAction? = null,
    val endRound: MatchAction? = null,
    val reset: MatchAction? = null,
)

@Composable
fun JudgeSessionState.rememberControlActions(): MatchActions {
    val event = matchState.roundInfo
    val state = event?.state
    return remember(event?.roundNumber, event?.totalRounds, state, event?.round) {

        val isPaused = state == RoundState.PAUSED
        val isActive = state == RoundState.STARTED && event.round is RoundInfo.Round

        MatchActions(
            startRound = { eventSink(JudgeSessionEvent.StartRound) },
            resume = { eventSink(JudgeSessionEvent.Resume) }.takeIf { isPaused },
            pause = { eventSink(JudgeSessionEvent.Pause) }.takeIf { isActive },
            endRound = { eventSink(JudgeSessionEvent.EndRound()) }.takeIf { isActive },
            reset = { eventSink(JudgeSessionEvent.Reset) }.takeIf { event != null }
        )
    }
}
