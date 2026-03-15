package dev.jvmname.accord.ui.create.newmatch

import androidx.compose.runtime.Immutable
import com.slack.circuit.runtime.CircuitUiEvent
import com.slack.circuit.runtime.CircuitUiState
import com.slack.circuit.runtime.screen.Screen
import dev.jvmname.accord.parcel.CommonParcelize

@CommonParcelize
data object NewMatchScreen : Screen

@Immutable
data class NewMatchState(
    val matName: String,
    val loading: Boolean,
    val error: String?,
    val eventSink: (NewMatchEvent) -> Unit,
) : CircuitUiState

sealed interface NewMatchEvent : CircuitUiEvent {
    data object Back : NewMatchEvent
    data class CreateMatch(val redName: String, val blueName: String) : NewMatchEvent
}
