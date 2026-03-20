package dev.jvmname.accord.ui.session.judging

import androidx.compose.runtime.Stable
import com.slack.circuit.runtime.CircuitUiState
import dev.drewhamilton.poko.Poko
import dev.jvmname.accord.domain.control.HapticEvent
import dev.jvmname.accord.domain.control.rounds.RoundEvent
import dev.jvmname.accord.domain.control.score.Score
import dev.jvmname.accord.parcel.CommonParcelize
import dev.jvmname.accord.parcel.ParcelableScreen
import dev.jvmname.accord.ui.session.JudgeSessionEvent
import dev.jvmname.accord.ui.session.MatchActions


@CommonParcelize
data object JudgeSessionScreen : ParcelableScreen

@Stable
data class JudgeSessionState(
    val matName: String,
    val matchState: MatchState,
    val hapticEvent: HapticEvent? = null,
    val actions: MatchActions,
    val isMatchEnded: Boolean = false,
    val eventSink: (JudgeSessionEvent) -> Unit,
) : CircuitUiState

@Poko
class MatchState(
    val score: Score,
    val roundInfo: RoundEvent?,
)
