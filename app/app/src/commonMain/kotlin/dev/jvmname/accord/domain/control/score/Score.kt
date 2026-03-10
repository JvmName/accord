package dev.jvmname.accord.domain.control.score

import androidx.compose.runtime.Immutable
import dev.jvmname.accord.domain.Competitor
import kotlin.time.Duration

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
