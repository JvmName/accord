package dev.jvmname.accord.ui.ride_time

import androidx.compose.runtime.Immutable
import com.slack.circuit.runtime.CircuitUiEvent
import com.slack.circuit.runtime.CircuitUiState
import com.slack.circuit.runtime.screen.Screen
import dev.jvmname.accord.domain.Competitor
import dev.jvmname.accord.parcel.CommonParcelize


enum class RideTimeType { SOLO, CONSENSUS }

@CommonParcelize
data class RideTimeScreen(val type: RideTimeType) : Screen

@Immutable
data class RideTimeState(
    val matName: String,
    val activeRidingCompetitor: Competitor?,
    val redTime: String,
    val blueTime: String,
    val eventSink: (RideTimeEvent) -> Unit
) : CircuitUiState

fun RideTimeState.competitorTime(competitor: Competitor): String {
    return when (competitor) {
        Competitor.RED -> redTime
        Competitor.BLUE -> blueTime
    }
}


sealed interface RideTimeEvent : CircuitUiEvent {
    data object Back : RideTimeEvent
    data class ButtonPress(val competitor: Competitor) : RideTimeEvent
    data class ButtonRelease(val competitor: Competitor) : RideTimeEvent

}