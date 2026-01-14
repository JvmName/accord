package dev.jvmname.accord.ui.create_mat

import androidx.compose.runtime.Immutable
import com.slack.circuit.runtime.CircuitUiEvent
import com.slack.circuit.runtime.CircuitUiState
import com.slack.circuit.runtime.screen.PopResult
import com.slack.circuit.runtime.screen.Screen
import dev.jvmname.accord.network.Mat
import dev.jvmname.accord.parcel.CommonParcelize

@CommonParcelize
data object CreateMatScreen : Screen {
    @CommonParcelize
    data class CreateMatResult(val mat: Mat) : PopResult
}

@Immutable
data class CreateMatState(
    val loading: Boolean = false,
    val error: String? = null,
    val eventSink: (CreateMatEvent) -> Unit
) : CircuitUiState

sealed interface CreateMatEvent : CircuitUiEvent {
    data class CreateMat(val name: String, val count: Int) : CreateMatEvent
    data object Back : CreateMatEvent

}
