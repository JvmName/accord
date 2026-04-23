package dev.jvmname.accord.domain.session

import co.touchlab.kermit.Logger
import com.github.michaelbull.result.Err
import dev.jvmname.accord.di.MatchScope
import dev.jvmname.accord.domain.Competitor
import dev.jvmname.accord.domain.MatchManager
import dev.jvmname.accord.domain.control.AudioEvent
import dev.jvmname.accord.domain.control.ButtonEvent
import dev.jvmname.accord.domain.control.ButtonPressTracker
import dev.jvmname.accord.domain.control.HapticEvent
import dev.jvmname.accord.domain.control.RoundAudioFeedbackHelper
import dev.jvmname.accord.domain.control.ScoreHapticFeedbackHelper
import dev.jvmname.accord.domain.control.rounds.MatchConfig
import dev.jvmname.accord.domain.control.rounds.RoundEvent
import dev.jvmname.accord.domain.control.rounds.RoundInfo
import dev.jvmname.accord.domain.control.rounds.Timer
import dev.jvmname.accord.domain.control.score.Score
import dev.jvmname.accord.network.Match
import dev.jvmname.accord.network.NetworkResult
import dev.jvmname.accord.network.Round
import dev.jvmname.accord.network.RoundResult
import dev.jvmname.accord.network.RoundResultMethod
import dev.jvmname.accord.network.RoundResultType
import dev.jvmname.accord.ui.session.ManualEditAction
import dev.zacsweers.metro.Inject
import dev.zacsweers.metro.SingleIn
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
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
import kotlin.time.Clock
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
    private val match: Match,
    private val matchManager: MatchManager,
    hapticFactory: ScoreHapticFeedbackHelper.Factory,
    audioFactory: RoundAudioFeedbackHelper.Factory,
) : SoloSession {

    private var roundNumber: Int = 1
    private var overallIndex: Int = 0
    private val totalRounds: Int = config.rounds.count { it is RoundInfo.Round }
    private val completedRounds = mutableMapOf<Int, Round>() // roundNumber → finished Round
    private val _roundEvent = MutableStateFlow<RoundEvent?>(null)
    override val roundEvent: StateFlow<RoundEvent?> = _roundEvent.asStateFlow()

    private var timerCollectionJob: Job? = null
    private var latestRoundEvent = AtomicReference<RoundEvent?>(null)
    private val _score = MutableStateFlow(Score(0, 0, null, null, null))
    override val score: StateFlow<Score> = _score.asStateFlow()

    private val hapticHelper = hapticFactory.create(
        buttonEvents = buttonPressTracker.buttonEvents,
        score = _score,
    )
    override val hapticEvents: SharedFlow<HapticEvent> = hapticHelper.hapticEvents

    private val audioHelper = audioFactory.create(_roundEvent)
    override val audioEvents: SharedFlow<AudioEvent> = audioHelper.audioEvents

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
                                Competitor.Orange -> (prev.redPoints + newPointsThisTick) to prev.bluePoints
                                Competitor.Green -> prev.redPoints to (prev.bluePoints + newPointsThisTick)
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

    override suspend fun startMatch(): NetworkResult<Match> {
        startRound()
        return Err(mapOf("solo" to listOf("no server match in solo mode")))
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
        val event = _roundEvent.value
        if (event != null && event.round is RoundInfo.Round && event.state != RoundEvent.RoundState.ENDED) {
            recordRoundResult(event.roundNumber)
        }

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

    private fun recordRoundResult(roundNumber: Int) {
        val score = _score.value
        val winner = when {
            score.techFallWin == Competitor.Orange -> match.red
            score.techFallWin == Competitor.Green -> match.blue
            score.redPoints > score.bluePoints -> match.red
            score.bluePoints > score.redPoints -> match.blue
            else -> null
        }
        val methodType = when {
            score.techFallWin != null -> RoundResultType.TECH_FALL
            score.redPoints == score.bluePoints -> RoundResultType.TIE
            else -> RoundResultType.POINTS
        }
        val baseRound = match.rounds.getOrNull(roundNumber - 1) ?: return
        completedRounds[roundNumber] = Round(
            id = baseRound.id,
            maxDuration = baseRound.maxDuration,
            startedAt = baseRound.startedAt,
            endedAt = Clock.System.now(),
            score = emptyMap(),
            result = RoundResult(
                winner = winner,
                method = RoundResultMethod(type = methodType, value = null),
            ),
        )
        pushMatchUpdate(endedAt = null)
    }

    private fun pushMatchUpdate(endedAt: kotlin.time.Instant?) {
        val updatedRounds = match.rounds.mapIndexed { idx, round ->
            completedRounds[idx + 1] ?: round
        }
        matchManager.updateCache(
            Match(
                id = match.id,
                creatorId = match.creatorId,
                matId = match.matId,
                startedAt = match.startedAt,
                endedAt = endedAt,
                red = match.red,
                blue = match.blue,
                rounds = updatedRounds,
            )
        )
    }

    override suspend fun endMatch(): NetworkResult<Match> {
        endRound()
        //TODO unclear if this is helpful, maybe Ok(Match)?
        return Err(mapOf("solo" to listOf("no server match in solo mode")))
    }


    private fun nextRound() {
        overallIndex++

        // Increment round number only for actual Rounds, not Breaks
        if (overallIndex < config.rounds.size && config[overallIndex] is RoundInfo.Round) {
            roundNumber++
        }

        if (overallIndex >= config.rounds.size) {
            pushMatchUpdate(endedAt = Clock.System.now())
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
        timerCollectionJob?.cancel()
        timerCollectionJob = scope.launch {
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
        action: ManualEditAction
    ) {
        // Guard: only allow edits when paused
        if (latestRoundEvent.load()?.state != RoundEvent.RoundState.PAUSED) {
            Logger.d { "ignoring $action because state is not paused, it's ${latestRoundEvent.load()?.state}" }
            return
        }

        val actionFun = when (action) {
            ManualEditAction.INCREMENT -> { p: Int -> p + 1 }
            ManualEditAction.DECREMENT -> { p: Int -> p - 1 }
        }

        _score.update {
            when (competitor) {
                Competitor.Orange -> it.copy(redPoints = actionFun(it.redPoints))
                Competitor.Green -> it.copy(bluePoints = actionFun(it.bluePoints))
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
            redPoints >= threshold -> Competitor.Orange
            bluePoints >= threshold -> Competitor.Green
            else -> null
        }
    }
}
