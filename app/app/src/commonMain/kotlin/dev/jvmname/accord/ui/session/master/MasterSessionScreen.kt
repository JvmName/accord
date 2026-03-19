package dev.jvmname.accord.ui.session.master

import androidx.compose.runtime.Immutable
import com.slack.circuit.runtime.CircuitUiState
import dev.jvmname.accord.domain.control.score.Score
import dev.jvmname.accord.network.MatchId
import dev.jvmname.accord.parcel.CommonParcelize
import dev.jvmname.accord.parcel.ParcelableScreen
import dev.jvmname.accord.ui.session.MasterSessionEvent

@CommonParcelize
data class MasterSessionScreen(val matchId: MatchId) : ParcelableScreen

@Immutable
data class MasterSessionState(
    val matchId: MatchId,
    val redName: String,
    val blueName: String,
    val score: Score,
    val elapsedSeconds: Long,
    val roundNumber: Int,
    val isMatchStarted: Boolean,
    val isMatchEnded: Boolean,
    val isPaused: Boolean,
    val error: String?,
    val eventSink: (MasterSessionEvent) -> Unit,
) : CircuitUiState
