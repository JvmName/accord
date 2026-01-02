package dev.jvmname.accord.ui.control

import androidx.compose.runtime.Immutable
import com.slack.circuit.runtime.CircuitUiEvent
import com.slack.circuit.runtime.CircuitUiState
import com.slack.circuit.runtime.screen.Screen
import dev.jvmname.accord.domain.Competitor
import dev.jvmname.accord.domain.control.ConsumableHapticEvent
import dev.jvmname.accord.domain.control.Score
import dev.jvmname.accord.parcel.CommonParcelize


enum class ControlTimeType { SOLO, CONSENSUS }

@CommonParcelize
data class ControlTimeScreen(val type: ControlTimeType) : Screen

@Immutable
data class ControlTimeState(
    val matName: String,
    val score: Score,
    val haptic: ConsumableHapticEvent?,
    val eventSink: (ControlTimeEvent) -> Unit
) : CircuitUiState

sealed interface ControlTimeEvent : CircuitUiEvent {
    data object Back : ControlTimeEvent
    data class ButtonPress(val competitor: Competitor) : ControlTimeEvent
    data class ButtonRelease(val competitor: Competitor) : ControlTimeEvent

}