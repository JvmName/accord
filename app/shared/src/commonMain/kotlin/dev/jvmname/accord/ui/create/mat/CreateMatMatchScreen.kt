package dev.jvmname.accord.ui.create.mat

import androidx.compose.runtime.Immutable
import com.slack.circuit.runtime.CircuitUiEvent
import com.slack.circuit.runtime.CircuitUiState
import dev.jvmname.accord.parcel.CommonParcelize
import dev.jvmname.accord.parcel.ParcelableScreen

@CommonParcelize
data object CreateMatMatchScreen : ParcelableScreen

@Immutable
data class CreateMatMatchState(
    val loading: Boolean = false,
    val error: String? = null,
    val eventSink: (CreateMatMatchEvent) -> Unit
) : CircuitUiState

sealed interface CreateMatMatchEvent : CircuitUiEvent {
    data class CreateMat(
        val matName: String,
        val judgeCount: Int,
        val redName: String,
        val blueName: String,
    ) : CreateMatMatchEvent
    data object Back : CreateMatMatchEvent
    data object LongClick : CreateMatMatchEvent

}
