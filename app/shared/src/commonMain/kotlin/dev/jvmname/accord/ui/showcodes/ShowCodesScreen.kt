package dev.jvmname.accord.ui.showcodes

import androidx.compose.runtime.Immutable
import com.slack.circuit.runtime.CircuitUiEvent
import com.slack.circuit.runtime.CircuitUiState
import dev.jvmname.accord.network.Mat
import dev.jvmname.accord.network.Match
import dev.jvmname.accord.network.User
import dev.jvmname.accord.parcel.CommonParcelize
import dev.jvmname.accord.parcel.ParcelableScreen

@CommonParcelize
data class ShowCodesScreen(
    val mat: Mat,
    val match: Match,
    val judgeCount: Int?,
    val embedded : Boolean = false,
) : ParcelableScreen

@Immutable
data class ShowCodesState(
    val adminCode: String,
    val viewerCode: String,
    val joinedJudges: List<User>,
    val totalJudges: Int,
    val embedded: Boolean,
    val eventSink: (ShowCodesEvent) -> Unit,
) : CircuitUiState

sealed interface ShowCodesEvent : CircuitUiEvent {
    data object Ready : ShowCodesEvent
    data object Back : ShowCodesEvent
}
