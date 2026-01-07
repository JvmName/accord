package dev.jvmname.accord.domain.control

import androidx.compose.runtime.Immutable
import co.touchlab.kermit.Logger
import dev.jvmname.accord.di.MatchScope
import dev.jvmname.accord.domain.Competitor
import dev.jvmname.accord.ui.control.ControlTimeEvent.ManualPointEdit
import dev.zacsweers.metro.ContributesBinding
import dev.zacsweers.metro.SingleIn
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.flow.scan
import kotlinx.coroutines.flow.update
import kotlin.concurrent.atomics.AtomicReference
import kotlin.time.Duration
import kotlin.time.Duration.Companion.seconds


interface ScoreKeeper {
    val score: StateFlow<Score>
    fun resetScores()
    fun manualEdit(competitor: Competitor, action: ManualPointEdit.Action)
}

@[ContributesBinding(MatchScope::class) SingleIn(MatchScope::class)]
class RealScoreKeeper(
    tracker: ButtonPressTracker,
    roundTracker: RoundTracker,
    scope: CoroutineScope,
    private val config: RoundConfig,
) : ScoreKeeper {

    private var latestRoundEvent = AtomicReference<RoundEvent?>(null)
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
                    is ButtonEvent.Holding -> {
                        val roundEvent = latestRoundEvent.load()
                        if (roundEvent == null) {
                            Logger.d("received button hold before beginning - ignoring")
                            return@onEach
                        }
                        if (roundEvent.round is BaseRound.Break) {
                            Logger.d("received button hold during break - ignoring")
                            return@onEach
                        }
                        if (roundEvent.state == RoundEvent.RoundState.PAUSED) {
                            Logger.d("received button hold during pause - ignoring")
                            return@onEach
                        }

                        _score.update { prev ->
                            val previousTime = prev.activeControlTime ?: Duration.ZERO
                            val totalSessionTime = previousTime + OneSecond

                            val previousSessionPoints = (previousTime / PointThreshold).toInt()
                            val currentSessionPoints =
                                (totalSessionTime / PointThreshold).toInt()
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

        // Auto-reset scores on transition from ENDED to STARTED
        roundTracker.roundEvent
            .onEach { latestRoundEvent.exchange(it) }
            .scan(Pair<RoundEvent?, RoundEvent?>(null, null)) { (_, current), new ->
                current to new
            }
            .onEach { (previous, current) ->
                Logger.d { "State transition: prev=${previous?.state}/${previous?.round} -> curr=${current?.state}/${current?.round}" }
                if (previous?.round is BaseRound.Break
                    && current?.state == RoundEvent.RoundState.STARTED
                    && current.round is BaseRound.Round
                ) {
                    Logger.d { "Round transitioning from ENDED Break to STARTED Round, resetting scores" }
                    resetScores()
                }
            }
            .launchIn(scope)
    }

    override fun manualEdit(
        competitor: Competitor,
        action: ManualPointEdit.Action
    ) {
        //double-check we're paused
        if (latestRoundEvent.load()?.state != RoundEvent.RoundState.PAUSED) {
            Logger.d { "ignoring $action because state is not paused, it's ${latestRoundEvent.load()?.state}" }
            return
        }

        val actionFun = when (action) {
            ManualPointEdit.Action.INCREMENT -> { p: Int -> p + 1 }
            ManualPointEdit.Action.DECREMENT -> { p: Int -> p - 1 }
        }

        _score.update {
            when (competitor) {
                Competitor.RED -> it.copy(redPoints = actionFun(it.redPoints))
                Competitor.BLUE -> it.copy(bluePoints = actionFun(it.bluePoints))
            }
        }
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

    private fun hasTechFallWin(redPoints: Int, bluePoints: Int): Competitor? {
        val event = latestRoundEvent.load() ?: return null
        val threshold = config.getRound(event.roundNumber)?.maxPoints ?: return null
        return when {
            redPoints >= threshold -> Competitor.RED
            bluePoints >= threshold -> Competitor.BLUE
            else -> null
        }
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
    }

    fun controlTimeHumanReadable(competitor: Competitor) = when (activeCompetitor) {
        competitor -> ((activeControlTime!!.inWholeSeconds % 3) + 1).toString()
        else -> null
    }
}