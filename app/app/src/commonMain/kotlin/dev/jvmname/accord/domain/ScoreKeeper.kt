package dev.jvmname.accord.domain

import dev.zacsweers.metro.Inject
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.flow.update
import kotlin.time.Duration
import kotlin.time.Duration.Companion.seconds

@Inject
class ScoreKeeper(
    tracker: ButtonPressTracker,
    scope: CoroutineScope
) {

    private val _score = MutableStateFlow(
        Score(
            redPoints = 0,
            bluePoints = 0,
            activeControlTime = null,
            activeCompetitor = null,
            technicalSuperiorityWinner = null
        )
    )
    val score: StateFlow<Score> = _score.asStateFlow()

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
                            // Reset session if competitor changed (defensive, shouldn't happen)
                            val sessionTime = if (prev.activeCompetitor != event.competitor) {
                                OneSecond
                            } else {
                                (prev.activeControlTime ?: Duration.ZERO) + OneSecond
                            }

                            // Convert accumulated time to points (every 3 seconds = 1 point)
                            val newPoints = (sessionTime / PointThreshold).toInt()
                            val remainingTime = sessionTime - (PointThreshold * newPoints)

                            val (newRedPoints, newBluePoints) = when (event.competitor) {
                                Competitor.RED -> (prev.redPoints + newPoints) to prev.bluePoints
                                Competitor.BLUE -> prev.redPoints to (prev.bluePoints + newPoints)
                            }

                            Score(
                                redPoints = newRedPoints,
                                bluePoints = newBluePoints,
                                activeControlTime = remainingTime,
                                activeCompetitor = event.competitor,
                                technicalSuperiorityWinner = calculateTechnicalSuperiorityWinner(
                                    newRedPoints,
                                    newBluePoints
                                )
                            )
                        }
                    }

                    is ButtonEvent.Release, is ButtonEvent.SteadyState -> _score.update { prev ->
                        // Clear active control (points persist, sub-3s time is lost)
                        prev.copy(
                            activeControlTime = null,
                            activeCompetitor = null
                        )
                    }

                    is ButtonEvent.Press -> { /* Press doesn't affect score yet, wait for Holding */
                    }
                }
            }
            .launchIn(scope)
    }

    private fun calculateTechnicalSuperiorityWinner(redPoints: Int, bluePoints: Int): Competitor? {
        // TODO: May need to incorporate round time constraints later
        return when {
            redPoints >= TechnicalSuperiorityThreshold -> Competitor.RED
            bluePoints >= TechnicalSuperiorityThreshold -> Competitor.BLUE
            else -> null
        }
    }

    // TODO: Hook this up to round end event when available
    fun resetScores() {
        _score.value = Score(
            redPoints = 0,
            bluePoints = 0,
            activeControlTime = null,
            activeCompetitor = null,
            technicalSuperiorityWinner = null
        )
    }
}

data class Score(
    val redPoints: Int,
    val bluePoints: Int,
    val activeControlTime: Duration?, // 0-2 seconds, null when no active control
    val activeCompetitor: Competitor?, // null when no one is controlling
    val technicalSuperiorityWinner: Competitor? // null until threshold reached
)