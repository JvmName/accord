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
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.flow.runningFold
import kotlinx.coroutines.launch

@Inject
@SingleIn(MatchScope::class)
class MasterSession(
    private val matchManager: MatchManager,
    private val scope: CoroutineScope,
    private val config: MatchConfig,
) : RoundController {

    private var currentMatchId: MatchId? = null
    private val _score = MutableStateFlow(Score(0, 0, null, null, null))
    override val score: StateFlow<Score> = _score.asStateFlow()
    private val _roundEvent = MutableStateFlow<RoundEvent?>(null)
    override val roundEvent: StateFlow<RoundEvent?> = _roundEvent.asStateFlow()
    private val _hapticEvents = MutableSharedFlow<HapticEvent>()
    override val hapticEvents: SharedFlow<HapticEvent> = _hapticEvents.asSharedFlow()

    init {
        scope.launch {
            matchManager.observeCurrentMatch().collect { match ->
                match ?: return@collect
                currentMatchId = match.id
                _score.value = deriveScoreFromMatch(match)
                _roundEvent.value = deriveRoundEventFromMatch(match)
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
                    if (current?.remaining == kotlin.time.Duration.ZERO && current.state == RoundEvent.RoundState.STARTED) {
                        _hapticEvents.emit(HapticEvent(Consumable(HapticTrigger.TimeExpired.effect)))
                    }
                }
        }
    }

    override fun startRound() {
        scope.launch { matchManager.startRound() }
    }

    override fun endRound(winner: Competitor?, submission: String?) {
        scope.launch { currentMatchId?.let { matchManager.endRound(it, submission, winner) } }
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

    private fun deriveRoundEventFromMatch(match: Match): RoundEvent? =
        deriveRoundEventFromMatch(match, config)
}
