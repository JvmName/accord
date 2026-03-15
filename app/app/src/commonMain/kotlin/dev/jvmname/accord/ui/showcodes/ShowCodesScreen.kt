package dev.jvmname.accord.ui.showcodes

import androidx.compose.runtime.Immutable
import com.slack.circuit.runtime.CircuitUiEvent
import com.slack.circuit.runtime.CircuitUiState
import com.slack.circuit.runtime.screen.Screen
import dev.jvmname.accord.network.Mat
import dev.jvmname.accord.network.Match
import dev.jvmname.accord.parcel.CommonParcelize

@CommonParcelize
data class ShowCodesScreen(val mat: Mat, val match: Match) : Screen

@Immutable
data class ShowCodesState(
    val mat: Mat,
    val match: Match,
    val eventSink: (ShowCodesEvent) -> Unit,
) : CircuitUiState

sealed interface ShowCodesEvent : CircuitUiEvent {
    data object Ready : ShowCodesEvent
    data object Back : ShowCodesEvent
}
