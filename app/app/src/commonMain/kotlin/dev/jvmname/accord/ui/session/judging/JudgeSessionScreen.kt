package dev.jvmname.accord.ui.session.judging

import androidx.compose.runtime.Stable
import com.slack.circuit.runtime.CircuitUiState
import dev.jvmname.accord.domain.control.HapticEvent
import dev.jvmname.accord.parcel.CommonParcelize
import dev.jvmname.accord.parcel.ParcelableScreen
import dev.jvmname.accord.ui.session.JudgeSessionEvent
import dev.jvmname.accord.ui.session.MatchActions
import dev.jvmname.accord.ui.session.MatchState


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

