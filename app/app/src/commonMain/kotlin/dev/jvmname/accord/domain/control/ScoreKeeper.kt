package dev.jvmname.accord.domain.control

import androidx.compose.runtime.Immutable
import dev.jvmname.accord.domain.Competitor
import dev.zacsweers.metro.AppScope
import dev.zacsweers.metro.ContributesBinding
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.flow.update
import kotlin.time.Duration
import kotlin.time.Duration.Companion.milliseconds
import kotlin.time.Duration.Companion.seconds
import kotlin.time.DurationUnit


interface ScoreKeeper {
    val score: StateFlow<Score>
    fun resetScores()
}

@[ContributesBinding(AppScope::class)]
class RealScoreKeeper(
    tracker: ButtonPressTracker,
    scope: CoroutineScope
) : ScoreKeeper {

    private val _score = MutableStateFlow(
        Score(
            redPoints = 0,
            bluePoints = 0,
            activeControlTime = null,
            activeCompetitor = null,
            sessionBasePoints = null,
            techFallWin = null
        )
    )
    override val score: StateFlow<Score> = _score.asStateFlow()

    companion object {
        private val OneSecond = 1.seconds
        private val PointThreshold = 3.seconds
        private const val TechnicalSuperiorityThreshold = 10
    }

    init {
        tracker.buttonEvents
            .onEach { event ->
                when (event) {
                    is ButtonEvent.Holding -> {
                        _score.update { prev ->
                            // Determine if this is a new session or continuation
                            val isNewSession = prev.activeCompetitor != event.competitor

                            // Calculate total session time (now stored, not remainder!)
                            val totalSessionTime = when {
                                isNewSession -> OneSecond
                                else -> (prev.activeControlTime ?: Duration.ZERO) + OneSecond
                            }

                            // Get base points for this session
                            val basePoints = when {
                                isNewSession -> when (event.competitor) {
                                    Competitor.RED -> prev.redPoints
                                    Competitor.BLUE -> prev.bluePoints
                                }

                                else -> prev.sessionBasePoints ?: 0
                            }

                            // Calculate points earned in this session
                            val sessionPoints = (totalSessionTime / PointThreshold).toInt()

                            // Calculate new total points
                            val (newRedPoints, newBluePoints) = when (event.competitor) {
                                Competitor.RED -> (basePoints + sessionPoints) to prev.bluePoints
                                Competitor.BLUE -> prev.redPoints to (basePoints + sessionPoints)
                            }

                            Score(
                                redPoints = newRedPoints,
                                bluePoints = newBluePoints,
                                activeControlTime = totalSessionTime,
                                activeCompetitor = event.competitor,
                                sessionBasePoints = basePoints,
                                techFallWin = hasTechFallWin(newRedPoints, newBluePoints)
                            ).also {
                                println("Score: \n$it")
                            }
                        }
                    }

                    is ButtonEvent.Release, is ButtonEvent.SteadyState -> _score.update { prev ->
                        // Clear active control (points persist, sub-3s time is lost)
                        prev.copy(
                            activeControlTime = null,
                            activeCompetitor = null,
                            sessionBasePoints = null
                        )
                    }

                    is ButtonEvent.Press -> { /* Press doesn't affect score yet, wait for Holding */
                    }
                }
            }
            .launchIn(scope)
    }

    private fun hasTechFallWin(redPoints: Int, bluePoints: Int): Competitor? {
        return null
        // TODO: need to incorporate round time constraints later
//        return when {
//            redPoints >= TechnicalSuperiorityThreshold -> Competitor.RED
//            bluePoints >= TechnicalSuperiorityThreshold -> Competitor.BLUE
//            else -> null
//        }
    }

    // TODO: Hook this up to round end event when available
    override fun resetScores() {
        _score.value = Score(
            redPoints = 0,
            bluePoints = 0,
            activeControlTime = null,
            activeCompetitor = null,
            sessionBasePoints = null,
            techFallWin = null
        )
    }
}

@Immutable
data class Score(
    val redPoints: Int,
    val bluePoints: Int,
    val activeControlTime: Duration?, // Total session time, null when no active control
    val activeCompetitor: Competitor?, // null when no one is controlling
    val sessionBasePoints: Int?, // Points when current session started (for calculating incremental points)
    val techFallWin: Competitor? // null until threshold reached
) {
    fun getPoints(competitor: Competitor) = when (competitor) {
        Competitor.RED -> redPoints
        Competitor.BLUE -> bluePoints
    }.toString()

    fun controlTimeHumanReadable(competitor: Competitor) = when (activeCompetitor) {
        competitor -> {
            val remainder = (activeControlTime!!.inWholeMilliseconds % 3000).milliseconds
            remainder.toString(DurationUnit.SECONDS, 0)
        }

        else -> null
    }
}