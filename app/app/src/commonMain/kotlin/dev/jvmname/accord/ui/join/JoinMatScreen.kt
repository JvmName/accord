package dev.jvmname.accord.ui.join

import androidx.compose.runtime.Immutable
import com.slack.circuit.runtime.CircuitUiEvent
import com.slack.circuit.runtime.CircuitUiState
import com.slack.circuit.runtime.screen.Screen
import dev.jvmname.accord.network.MatCode
import dev.jvmname.accord.parcel.CommonParcelize

@CommonParcelize
data class JoinMatScreen(val joinCode: MatCode? = null) : Screen

@Immutable
data class JoinMatState(
    val loading: Boolean = false,
    val error: String? = null,
    val eventSink: (JoinMatEvent) -> Unit,
) : CircuitUiState

sealed interface JoinMatEvent : CircuitUiEvent {
    data object Back : JoinMatEvent
    data class OnJoinCodeEntered(val code: String, val name: String) : JoinMatEvent
}
