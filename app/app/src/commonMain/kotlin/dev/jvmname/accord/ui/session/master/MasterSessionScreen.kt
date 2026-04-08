package dev.jvmname.accord.ui.session.master

import androidx.compose.runtime.Immutable
import com.slack.circuit.runtime.CircuitUiState
import dev.jvmname.accord.domain.Competitor
import dev.jvmname.accord.network.MatchId
import dev.jvmname.accord.parcel.CommonParcelize
import dev.jvmname.accord.parcel.ParcelableScreen
import dev.jvmname.accord.ui.session.MasterSessionEvent
import dev.jvmname.accord.ui.session.MatchActions
import dev.jvmname.accord.ui.session.MatchState
import dev.jvmname.accord.ui.session.judging.MatchResult

@CommonParcelize
data class MasterSessionScreen(val matchId: MatchId) : ParcelableScreen

data class RoundDisplayInfo(
    val roundNumber: Int,
    val isInProgress: Boolean,
    val winner: Competitor?,
    val redScore: Int,
    val blueScore: Int,
)

@Immutable
data class MasterSessionState(
    val matName: String,
    val redName: String,
    val blueName: String,
    val matchState: MatchState,
    val isMatchStarted: Boolean,
    val matchResult: MatchResult?,
    val actions: MatchActions,
    val showEndRoundDialog: Boolean,
    val showScoresOverlay: Boolean,
    val roundDisplays: List<RoundDisplayInfo>,
    val error: String?,
    val eventSink: (MasterSessionEvent) -> Unit,
) : CircuitUiState
