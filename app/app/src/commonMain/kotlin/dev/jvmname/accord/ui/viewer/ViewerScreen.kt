package dev.jvmname.accord.ui.viewer

import androidx.compose.runtime.Immutable
import com.slack.circuit.runtime.CircuitUiEvent
import com.slack.circuit.runtime.CircuitUiState
import com.slack.circuit.runtime.screen.Screen
import dev.jvmname.accord.network.MatId
import dev.jvmname.accord.parcel.CommonParcelize

@CommonParcelize
data class ViewerScreen(val matId: MatId) : Screen

@Immutable
data class ViewerState(
    val eventSink: (ViewerEvent) -> Unit,
) : CircuitUiState

sealed interface ViewerEvent : CircuitUiEvent {
    data object Back : ViewerEvent
}
