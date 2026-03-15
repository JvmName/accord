package dev.jvmname.accord.ui.create.mat

import androidx.compose.runtime.Immutable
import com.slack.circuit.runtime.CircuitUiEvent
import com.slack.circuit.runtime.CircuitUiState
import com.slack.circuit.runtime.screen.Screen
import dev.jvmname.accord.parcel.CommonParcelize

@CommonParcelize
data object CreateMatMatchScreen : Screen

@Immutable
data class CreateMatMatchState(
    val loading: Boolean = false,
    val error: String? = null,
    val eventSink: (CreateMatMatchEvent) -> Unit
) : CircuitUiState

sealed interface CreateMatMatchEvent : CircuitUiEvent {
    data class CreateMat(
        val masterName: String,
        val matName: String,
        val judgeCount: Int,
        val redName: String,
        val blueName: String,
        val isJudging: Boolean,
    ) : CreateMatMatchEvent
    data object Back : CreateMatMatchEvent

}
