package dev.jvmname.accord.ui.session.master

import androidx.compose.runtime.Immutable
import com.slack.circuit.runtime.CircuitUiState
import dev.jvmname.accord.network.MatchId
import dev.jvmname.accord.parcel.CommonParcelize
import dev.jvmname.accord.parcel.ParcelableScreen
import dev.jvmname.accord.ui.session.MasterSessionEvent
import dev.jvmname.accord.ui.session.MatchActions
import dev.jvmname.accord.ui.session.MatchState

@CommonParcelize
data class MasterSessionScreen(val matchId: MatchId) : ParcelableScreen

@Immutable
data class MasterSessionState(
    val matName: String,
    val redName: String,
    val blueName: String,
    val matchState: MatchState,
    val isMatchStarted: Boolean,
    val isMatchEnded: Boolean,
    val actions: MatchActions,
    val showEndRoundDialog: Boolean,
    val error: String?,
    val eventSink: (MasterSessionEvent) -> Unit,
) : CircuitUiState
