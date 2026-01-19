package dev.jvmname.accord.ui.main

import androidx.compose.runtime.Immutable
import com.slack.circuit.runtime.CircuitUiEvent
import com.slack.circuit.runtime.CircuitUiState
import com.slack.circuit.runtime.screen.Screen
import dev.jvmname.accord.network.Mat
import dev.jvmname.accord.parcel.CommonParcelize

@CommonParcelize
data class MainScreen(val mat: Mat? = null) : Screen

@Immutable
data class MainState(
    val mat: Mat?,
    val eventSink: (MainEvent) -> Unit
) : CircuitUiState

sealed interface MainEvent : CircuitUiEvent {
    data object CreateMat : MainEvent
    data object JoinMat : MainEvent

    data object SoloRideTime : MainEvent
}