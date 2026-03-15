package dev.jvmname.accord.ui.create.mat

import androidx.compose.runtime.Immutable
import com.slack.circuit.runtime.CircuitUiEvent
import com.slack.circuit.runtime.CircuitUiState
import com.slack.circuit.runtime.screen.PopResult
import com.slack.circuit.runtime.screen.Screen
import dev.jvmname.accord.network.Mat
import dev.jvmname.accord.parcel.CommonParcelize

@CommonParcelize
data object CreateMatMatchScreen : Screen {
    @CommonParcelize
    data class CreateMatResult(val mat: Mat) : PopResult
}

@Immutable
data class CreateMatMatchState(
    val loading: Boolean = false,
    val error: String? = null,
    val eventSink: (CreateMatMatchEvent) -> Unit
) : CircuitUiState

sealed interface CreateMatMatchEvent : CircuitUiEvent {
    data class CreateMat(
        val name: String,
        val count: Int,
        val redName: String,
        val blueName: String,
        val isJudging: Boolean,
    ) : CreateMatMatchEvent
    data object Back : CreateMatMatchEvent

}
