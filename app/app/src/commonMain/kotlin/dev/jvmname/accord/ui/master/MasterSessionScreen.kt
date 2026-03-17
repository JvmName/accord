package dev.jvmname.accord.ui.master

import androidx.compose.runtime.Immutable
import com.slack.circuit.runtime.CircuitUiEvent
import com.slack.circuit.runtime.CircuitUiState
import dev.jvmname.accord.network.CompetitorColor
import dev.jvmname.accord.network.MatchId
import dev.jvmname.accord.parcel.CommonParcelize
import dev.jvmname.accord.parcel.ParcelableScreen

@CommonParcelize
data class MasterSessionScreen(val matchId: MatchId) : ParcelableScreen

@Immutable
data class MasterSessionState(
    val matchId: MatchId,
    val redName: String,
    val blueName: String,
    val redScore: Int,
    val blueScore: Int,
    val elapsedSeconds: Long,
    val roundNumber: Int,
    val isMatchStarted: Boolean,
    val isMatchEnded: Boolean,
    val isPaused: Boolean,
    val error: String?,
    val eventSink: (MasterSessionEvent) -> Unit,
) : CircuitUiState

sealed interface MasterSessionEvent : CircuitUiEvent {
    data object StartMatch : MasterSessionEvent
    data object PauseRound : MasterSessionEvent
    data object ResumeRound : MasterSessionEvent
    data class EndRound(val submission: String? = null, val submitter: CompetitorColor? = null) : MasterSessionEvent
    data object StartNextRound : MasterSessionEvent
    data object EndMatch : MasterSessionEvent
    data object ShowCodes : MasterSessionEvent
    data object ReturnToMain : MasterSessionEvent
}
