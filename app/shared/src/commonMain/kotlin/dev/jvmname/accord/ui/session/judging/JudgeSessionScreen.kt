package dev.jvmname.accord.ui.session.judging

import androidx.compose.runtime.Immutable
import androidx.compose.runtime.Stable
import androidx.compose.ui.util.fastForEach
import com.slack.circuit.runtime.CircuitUiState
import dev.jvmname.accord.domain.Competitor
import dev.jvmname.accord.domain.asEmoji
import dev.jvmname.accord.domain.control.HapticEvent
import dev.jvmname.accord.parcel.CommonParcelize
import dev.jvmname.accord.parcel.ParcelableScreen
import dev.jvmname.accord.ui.session.JudgeSessionEvent
import dev.jvmname.accord.ui.session.MatchActions
import dev.jvmname.accord.ui.session.MatchState


@CommonParcelize
data object JudgeSessionScreen : ParcelableScreen

@Stable
data class JudgeSessionState(
    val matName: String,
    val matchState: MatchState,
    val hapticEvent: HapticEvent? = null,
    val actions: MatchActions,
    val matchResult: MatchResult? = null,
    val eventSink: (JudgeSessionEvent) -> Unit,
) : CircuitUiState


@Immutable
data class MatchResult(
//    val winner: Pair<User, Competitor>,
//    val winnerScore: Int,
//    val loserScore: Int,
    val winConditions: String,
    val roundWinners: List<Competitor?>,
) {
    fun toText(): String {
        if (roundWinners.isEmpty()) return "⬜ ⬜ ⬜"
        return buildString {
//            append("Winner: ", winner.first.name, ' ', winner.second.asEmoji).appendLine()
//            append("Score: ", winnerScore, " to ", loserScore, "(", winConditions, ")").appendLine()
            append("Results: ")
            roundWinners.fastForEach {
                append(it.asEmoji).append(' ')
            }
        }
    }
}