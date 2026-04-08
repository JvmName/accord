package dev.jvmname.accord.domain.session

import co.touchlab.kermit.Logger
import dev.jvmname.accord.di.MatchScope
import dev.jvmname.accord.domain.Competitor
import dev.jvmname.accord.domain.MatchManager
import dev.jvmname.accord.domain.control.HapticEvent
import dev.jvmname.accord.domain.control.HapticTrigger
import dev.jvmname.accord.domain.control.rounds.MatchConfig
import dev.jvmname.accord.domain.control.rounds.RoundEvent
import dev.jvmname.accord.domain.control.score.Score
import dev.jvmname.accord.network.Match
import dev.jvmname.accord.network.MatchId
import dev.jvmname.accord.network.NetworkResult
import dev.jvmname.accord.ui.common.Consumable
import dev.jvmname.accord.ui.session.ManualEditAction
import dev.zacsweers.metro.Inject
import dev.zacsweers.metro.SingleIn
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import kotlin.time.Duration
import kotlin.time.Duration.Companion.seconds

@Inject
@SingleIn(MatchScope::class)
class MasterSession(
    private val matchManager: MatchManager,
    private val scope: CoroutineScope,
    private val config: MatchConfig,
) : RoundController {

    private val log = Logger.withTag("Session/MasterSession")

    private var currentMatchId: MatchId? = null
    private val _score = MutableStateFlow(Score(0, 0, null, null, null))
    override val score: StateFlow<Score> = _score.asStateFlow()
    private val _roundEvent = MutableStateFlow<RoundEvent?>(null)
    override val roundEvent: StateFlow<RoundEvent?> = _roundEvent.asStateFlow()
    private var countdownJob: Job? = null
    private val _hapticEvents = MutableSharedFlow<HapticEvent>()
    override val hapticEvents: SharedFlow<HapticEvent> = _hapticEvents.asSharedFlow()

    init {
        scope.launch {
            matchManager.observeCurrentMatch()
                .filterNotNull()
                .collect { match ->
                    currentMatchId = match.id
                    _score.update {
                        deriveScoreFromMatch(match).also {
                            log.d { "scores derived red=${it.redPoints} blue=${it.bluePoints}" }
                        }
                    }
                    val event = deriveRoundEventFromMatch(match).also {
                        _roundEvent.value = it
                    }
                    if (event?.state == RoundEvent.RoundState.STARTED) {
                        startCountdown(event.remaining)
                    } else {
                        countdownJob?.cancel()
                        countdownJob = null
                    }
                }
        }

        scope.launch {
            _score
                .runningFold(null as Competitor? to null as Competitor?) { (_, prev), current ->
                    prev to current.techFallWin
                }
                .drop(1)
                .collect { (prev, current) ->
                    if (prev == null && current != null) {
                        log.i { "tech fall detected winner=$current" }
                        _hapticEvents.emit(HapticEvent(Consumable(HapticTrigger.TechFallWin.effect)))
                    }
                }
        }

        scope.launch {
            _roundEvent
                .runningFold(null as RoundEvent? to null as RoundEvent?) { (_, prev), current ->
                    prev to current
                }
                .drop(1)
                .collect { (_, current) ->
                    if (current != null) {
                        log.i { "round event → $current" }
                    }
                    if (current?.remaining == kotlin.time.Duration.ZERO && current.state == RoundEvent.RoundState.STARTED) {
                        log.i { "time expired in round" }
                        _hapticEvents.emit(HapticEvent(Consumable(HapticTrigger.TimeExpired.effect)))
                    }
                }
        }
    }

    override fun startRound() {
        scope.launch { matchManager.startRound() }
    }

    override fun endRound(winner: Competitor?, submission: String?, stoppage: Boolean) {
        scope.launch {
            currentMatchId?.let {
                when {
                    stoppage -> matchManager.endRound(it, stoppage = true, stopper = winner)
                    else -> matchManager.endRound(it, submission.orEmpty(), winner)
                }
            }
        }
    }

    override fun pause() {
        scope.launch { currentMatchId?.let { matchManager.pauseRound(it) } }
    }

    override fun resume() {
        scope.launch { currentMatchId?.let { matchManager.resumeRound(it) } }
    }

    override fun manualEdit(
        competitor: Competitor,
        action: ManualEditAction
    ) {
        Logger.d { "manualEdit: API not yet defined — TODO" }
    }

    suspend fun createMatch(matCode: String, red: String, blue: String): NetworkResult<Match> =
        matchManager.createMatch(matCode, red, blue)

    override suspend fun startMatch(): NetworkResult<Match> =
        matchManager.startMatch()

    override suspend fun endMatch(): NetworkResult<Match> =
        matchManager.endMatch()

    private fun startCountdown(initialRemaining: Duration) {
        countdownJob?.cancel()
        countdownJob = scope.launch {
            var remaining = initialRemaining
            while (remaining > Duration.ZERO) {
                delay(1.seconds)
                remaining -= 1.seconds
                val current = _roundEvent.value ?: return@launch
                if (current.state == RoundEvent.RoundState.STARTED) {
                    _roundEvent.value = current.copy(remaining = remaining)
                } else {
                    return@launch
                }
            }
        }
    }

    private fun deriveRoundEventFromMatch(match: Match): RoundEvent? =
        deriveRoundEventFromMatch(match, config)
}
