package dev.jvmname.accord.domain.control

import androidx.compose.runtime.Immutable
import co.touchlab.kermit.Logger
import dev.jvmname.accord.di.MatchScope
import dev.jvmname.accord.domain.Competitor
import dev.zacsweers.metro.ContributesBinding
import dev.zacsweers.metro.SingleIn
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.flow.update
import kotlin.time.Duration
import kotlin.time.Duration.Companion.seconds


interface ScoreKeeper {
    val score: StateFlow<Score>
    fun resetScores()
}

@[ContributesBinding(MatchScope::class) SingleIn(MatchScope::class)]
class RealScoreKeeper(
    tracker: ButtonPressTracker,
    roundTracker: RoundTracker,
    scope: CoroutineScope,
    private val config: RoundConfig,
) : ScoreKeeper {

    private val _score = MutableStateFlow(
        Score(
            redPoints = 0,
            bluePoints = 0,
            activeControlTime = null,
            activeCompetitor = null,
            techFallWin = null
        )
    )
    override val score: StateFlow<Score> = _score.asStateFlow()

    companion object {
        private val OneSecond = 1.seconds
        private val PointThreshold = 3.seconds
    }

    init {
        tracker.buttonEvents
            .onEach { event ->
                when (event) {
                    is ButtonEvent.Holding -> _score.update { prev ->
                        val previousTime = prev.activeControlTime ?: Duration.ZERO
                        val totalSessionTime = previousTime + OneSecond

                        val previousSessionPoints = (previousTime / PointThreshold).toInt()
                        val currentSessionPoints = (totalSessionTime / PointThreshold).toInt()
                        val newPointsThisTick = currentSessionPoints - previousSessionPoints

                        val (newRedPoints, newBluePoints) = when (event.competitor) {
                            Competitor.RED -> (prev.redPoints + newPointsThisTick) to prev.bluePoints
                            Competitor.BLUE -> prev.redPoints to (prev.bluePoints + newPointsThisTick)
                        }

                        Score(
                            redPoints = newRedPoints,
                            bluePoints = newBluePoints,
                            activeControlTime = totalSessionTime,
                            activeCompetitor = event.competitor,
                            techFallWin = hasTechFallWin(newRedPoints, newBluePoints)
                        ).also {
                            Logger.d { "Score: \n$it" }
                        }
                    }

                    is ButtonEvent.Release, is ButtonEvent.SteadyState -> _score.update { prev ->
                        // Clear active control (points persist, sub-3s time is voided)
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

        // Auto-reset scores on round end
        roundTracker.roundEvent
            .onEach { event ->
                if (event?.state == RoundEvent.RoundState.ENDED) {
                    Logger.d { "Round ended, resetting scores" }
                    resetScores()
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

    override fun resetScores() {
        _score.value = Score(
            redPoints = 0,
            bluePoints = 0,
            activeControlTime = null,
            activeCompetitor = null,
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
    val techFallWin: Competitor?, // null until threshold reached
) {
    fun getPoints(competitor: Competitor) = when (competitor) {
        Competitor.RED -> redPoints
        Competitor.BLUE -> bluePoints
    }.toString()

    fun controlTimeHumanReadable(competitor: Competitor) = when (activeCompetitor) {
        competitor -> ((activeControlTime!!.inWholeSeconds % 3) + 1).toString()
        else -> null
    }
}