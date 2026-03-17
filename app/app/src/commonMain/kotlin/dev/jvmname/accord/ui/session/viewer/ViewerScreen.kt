package dev.jvmname.accord.ui.session.viewer

import androidx.compose.runtime.Immutable
import com.slack.circuit.runtime.CircuitUiEvent
import com.slack.circuit.runtime.CircuitUiState
import dev.jvmname.accord.network.MatId
import dev.jvmname.accord.parcel.CommonParcelize
import dev.jvmname.accord.parcel.ParcelableScreen

@CommonParcelize
data class ViewerScreen(val matId: MatId) : ParcelableScreen

@Immutable
data class ViewerState(
    val eventSink: (ViewerEvent) -> Unit,
) : CircuitUiState

sealed interface ViewerEvent : CircuitUiEvent {
    data object Back : ViewerEvent
}
