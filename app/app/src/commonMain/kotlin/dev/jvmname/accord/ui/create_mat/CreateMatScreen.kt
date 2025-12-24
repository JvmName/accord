package dev.jvmname.accord.ui.create_mat

import androidx.compose.runtime.Immutable
import com.slack.circuit.runtime.CircuitUiEvent
import com.slack.circuit.runtime.CircuitUiState
import com.slack.circuit.runtime.screen.PopResult
import com.slack.circuit.runtime.screen.Screen
import dev.jvmname.accord.network.model.MatInfo
import dev.jvmname.accord.parcel.CommonParcelize

@CommonParcelize
data object CreateMatScreen : Screen {
    @CommonParcelize
    data class CreateMatResult(val mat: MatInfo) : PopResult
}

@Immutable
data class CreateMatState(
    val foo: Int,
    val eventSink: (CreateMatEvent) -> Unit
) : CircuitUiState

sealed interface CreateMatEvent : CircuitUiEvent {

}
