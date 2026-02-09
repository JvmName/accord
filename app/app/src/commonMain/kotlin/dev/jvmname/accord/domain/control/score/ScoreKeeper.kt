package dev.jvmname.accord.domain.control.score

import androidx.compose.runtime.Immutable
import dev.jvmname.accord.domain.Competitor
import dev.jvmname.accord.ui.control.ControlTimeEvent.ManualPointEdit
import kotlinx.coroutines.flow.StateFlow
import kotlin.time.Duration


interface ScoreKeeper {
    val score: StateFlow<Score>
    fun resetScores()
    fun manualEdit(competitor: Competitor, action: ManualPointEdit.Action)
}

@Immutable
data class Score(
    val redPoints: Int,
    val bluePoints: Int,
    val activeControlTime: Duration?, // Total session time, null when no active control
    val activeCompetitor: Competitor?, // null when no one is controlling
    val techFallWin: Competitor?, // null until threshold reached
) {
    fun getPoints(competitor: Competitor) = when (competitor) {
        Competitor.RED -> redPoints
        Competitor.BLUE -> bluePoints
    }

    fun controlTimeHumanReadable(competitor: Competitor) = when (activeCompetitor) {
        competitor -> ((activeControlTime!!.inWholeSeconds % 3) + 1).toString()
        else -> null
    }
}