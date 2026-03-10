package dev.jvmname.accord.domain.session

import co.touchlab.kermit.Logger
import dev.jvmname.accord.di.MatchScope
import dev.jvmname.accord.domain.Competitor
import dev.jvmname.accord.domain.control.ButtonEvent
import dev.jvmname.accord.domain.control.ButtonPressTracker
import dev.jvmname.accord.domain.control.HapticEvent
import dev.jvmname.accord.domain.control.ScoreHapticFeedbackHelper
import dev.jvmname.accord.domain.control.rounds.MatchConfig
import dev.jvmname.accord.domain.control.rounds.RoundEvent
import dev.jvmname.accord.domain.control.rounds.RoundInfo
import dev.jvmname.accord.domain.control.rounds.Timer
import dev.jvmname.accord.domain.control.score.Score
import dev.jvmname.accord.ui.control.ControlTimeEvent
import dev.zacsweers.metro.Inject
import dev.zacsweers.metro.SingleIn
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.flow.dropWhile
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.flow.runningFold
import kotlinx.coroutines.flow.scan
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlin.concurrent.atomics.AtomicReference
import kotlin.time.Duration
import kotlin.time.Duration.Companion.milliseconds
import kotlin.time.Duration.Companion.seconds

@Inject
@SingleIn(MatchScope::class)
class SoloMatchSession(
    private val buttonPressTracker: ButtonPressTracker,
    private val timer: Timer,
    private val scope: CoroutineScope,
    private val config: MatchConfig,
    private val hapticFactory: ScoreHapticFeedbackHelper.Factory,
) : SoloSession {

    private var roundNumber: Int = 1
    private var overallIndex: Int = 0
    private val totalRounds: Int = config.rounds.count { it is RoundInfo.Round }
    private val _roundEvent = MutableStateFlow<RoundEvent?>(null)
    override val roundEvent: StateFlow<RoundEvent?> = _roundEvent.asStateFlow()

    private var latestRoundEvent = AtomicReference<RoundEvent?>(null)
    private val _score = MutableStateFlow(Score(0, 0, null, null, null))
    override val score: StateFlow<Score> = _score.asStateFlow()

    private val hapticHelper = hapticFactory.create(
        buttonEvents = buttonPressTracker.buttonEvents,
        score = _score,
    )
    override val hapticEvents: SharedFlow<HapticEvent> = hapticHelper.hapticEvents

    companion object {
        private val OneSecond = 1.seconds
        private val PointThreshold = 3.seconds
    }

    init {
        buttonPressTracker.buttonEvents
            .onEach { event ->
                when (event) {
                    is ButtonEvent.Holding -> {
                        val roundEvent = latestRoundEvent.load()
                        if (roundEvent == null) {
                            Logger.d("received button hold before beginning - ignoring")
                            return@onEach
                        }
                        if (roundEvent.round is RoundInfo.Break) {
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

        // Auto-reset scores on transition from Break ENDED to Round STARTED
        _roundEvent
            .onEach { latestRoundEvent.exchange(it) }
            .scan(Pair<RoundEvent?, RoundEvent?>(null, null)) { (_, current), new ->
                current to new
            }
            .onEach { (previous, current) ->
                if (previous?.round is RoundInfo.Break
                    && current?.state == RoundEvent.RoundState.STARTED
                    && current.round is RoundInfo.Round
                ) {
                    resetScores()
                }
            }
            .launchIn(scope)

        // Auto-end round on tech fall win
        scope.launch {
            _score
                .runningFold(null as Competitor? to null as Competitor?) { (_, prev), current ->
                    prev to current.techFallWin
                }
                .drop(1)
                .collect { (prev, current) ->
                    if (prev == null && current != null) {
                        endRound()
                    }
                }
        }
    }

    override fun recordPress(competitor: Competitor) {
        buttonPressTracker.recordPress(competitor)
    }

    override fun recordRelease(competitor: Competitor) {
        buttonPressTracker.recordRelease(competitor)
    }

    override fun startRound() {
        if (_roundEvent.value != null) {
            nextRound()
        }

        if (overallIndex >= config.rounds.size) return

        val round = config[overallIndex]
        _roundEvent.value = RoundEvent(
            remaining = round.duration,
            roundNumber = roundNumber,
            totalRounds = totalRounds,
            round = round,
            state = RoundEvent.RoundState.STARTED
        )
        runTimer(round)
    }

    override fun pause() {
        timer.pause()
        _roundEvent.update {
            it?.copy(state = RoundEvent.RoundState.PAUSED)
        }
    }

    override fun resume() {
        timer.resume()
    }

    override fun endRound() {
        timer.cancel()

        _roundEvent.update {
            it ?: return@update null
            RoundEvent(
                remaining = it.remaining,
                roundNumber = it.roundNumber,
                totalRounds = totalRounds,
                round = it.round,
                state = RoundEvent.RoundState.ENDED
            )
        }
    }

    private fun nextRound() {
        overallIndex++

        // Increment round number only for actual Rounds, not Breaks
        if (overallIndex < config.rounds.size && config[overallIndex] is RoundInfo.Round) {
            roundNumber++
        }

        if (overallIndex >= config.rounds.size) {
            // No more rounds - emit final End event
            _roundEvent.update {
                RoundEvent(
                    remaining = Duration.ZERO,
                    roundNumber = roundNumber,
                    totalRounds = totalRounds,
                    round = it!!.round,
                    state = RoundEvent.RoundState.MATCH_ENDED
                )
            }
        }
    }

    private fun runTimer(baseRound: RoundInfo) {
        scope.launch {
            timer.start(baseRound.duration, 500.milliseconds)
                .dropWhile { it == Duration.ZERO }
                .collect { remaining ->
                    when (remaining) {
                        Duration.ZERO -> {
                            endRound()
                            startRound()
                        }

                        else -> {
                            _roundEvent.update {
                                RoundEvent(
                                    remaining = remaining,
                                    roundNumber = roundNumber,
                                    totalRounds = totalRounds,
                                    round = config[overallIndex],
                                    state = RoundEvent.RoundState.STARTED
                                )
                            }
                        }
                    }
                }
        }
    }

    override fun manualEdit(
        competitor: Competitor,
        action: ControlTimeEvent.ManualPointEdit.Action
    ) {
        // Guard: only allow edits when paused
        if (latestRoundEvent.load()?.state != RoundEvent.RoundState.PAUSED) {
            Logger.d { "ignoring $action because state is not paused, it's ${latestRoundEvent.load()?.state}" }
            return
        }

        val actionFun = when (action) {
            ControlTimeEvent.ManualPointEdit.Action.INCREMENT -> { p: Int -> p + 1 }
            ControlTimeEvent.ManualPointEdit.Action.DECREMENT -> { p: Int -> p - 1 }
        }

        _score.update {
            when (competitor) {
                Competitor.RED -> it.copy(redPoints = actionFun(it.redPoints))
                Competitor.BLUE -> it.copy(bluePoints = actionFun(it.bluePoints))
            }
        }
    }

    private fun resetScores() {
        _score.value = Score(0, 0, null, null, null)
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
