package dev.jvmname.accord.domain.session

import co.touchlab.kermit.Logger
import dev.jvmname.accord.di.MatchScope
import dev.jvmname.accord.domain.Competitor
import dev.jvmname.accord.domain.MatchManager
import dev.jvmname.accord.domain.control.HapticEvent
import dev.jvmname.accord.domain.control.rounds.MatchConfig
import dev.jvmname.accord.domain.control.rounds.RoundEvent
import dev.jvmname.accord.domain.control.score.Score
import dev.jvmname.accord.network.Match
import dev.jvmname.accord.network.MatchId
import dev.jvmname.accord.network.NetworkResult
import dev.jvmname.accord.ui.session.ManualEditAction
import dev.zacsweers.metro.Inject
import dev.zacsweers.metro.SingleIn
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.updateAndGet
import kotlinx.coroutines.launch
import kotlin.time.Duration
import kotlin.time.Duration.Companion.milliseconds

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
    override val hapticEvents: SharedFlow<HapticEvent> = MutableSharedFlow()

    init {
        scope.launch {
            matchManager.observeCurrentMatch()
                .filterNotNull()
                .collect { match ->
                    currentMatchId = match.id
                    val newScore = _score.updateAndGet { deriveScoreFromMatch(match) }
                    log.d { "scores derived red=${newScore.redPoints} blue=${newScore.bluePoints}" }
                    if (_score.value.techFallWin == null && newScore.techFallWin != null) {
                        log.i { "tech fall detected winner=${newScore.techFallWin}" }
                    }
                    val event =
                        _roundEvent.updateAndGet { deriveRoundEventFromMatch(match, config) }
                            .also { log.i { "round event → $it" } }
                    when (event?.state) {
                        RoundEvent.RoundState.STARTED -> startCountdown(event)
                        else -> {
                            countdownJob?.cancel()
                            countdownJob = null
                        }
                    }
                }
        }
    }

    override fun startRound() {
        scope.launch { matchManager.startRound() }
    }

    override fun endRound() {
        scope.launch {
            currentMatchId?.let { matchManager.endRound(it) }
        }
    }

    fun recordRoundResult(winner: Competitor?, stoppage: Boolean) {
        scope.launch {
            currentMatchId?.let { matchManager.patchRoundResult(it, winner, stoppage) }
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

    override suspend fun startMatch(): NetworkResult<Match> =
        matchManager.startMatch()

    override suspend fun endMatch(): NetworkResult<Match> =
        matchManager.endMatch()

    private fun startCountdown(event: RoundEvent) {
        countdownJob?.cancel()
        countdownJob = scope.launch {
            var remaining = event.remaining
            while (remaining > Duration.ZERO) {
                delay(300.milliseconds)
                val current = _roundEvent.value ?: return@launch
                if (current.round != event.round || current.roundNumber != event.roundNumber) return@launch
                if (current.state != RoundEvent.RoundState.STARTED) return@launch
                remaining -= 300.milliseconds
                _roundEvent.value = current.copy(remaining = remaining)
            }
            log.i { "time expired in round" }
        }
    }
}
