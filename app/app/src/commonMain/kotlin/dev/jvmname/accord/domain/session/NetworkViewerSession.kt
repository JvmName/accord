package dev.jvmname.accord.domain.session

import dev.jvmname.accord.di.MatchScope
import dev.jvmname.accord.domain.MatchManager
import dev.jvmname.accord.domain.control.HapticEvent
import dev.jvmname.accord.domain.control.rounds.MatchConfig
import dev.jvmname.accord.domain.control.rounds.RoundEvent
import dev.jvmname.accord.domain.control.score.Score
import dev.jvmname.accord.network.Match
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
import kotlinx.coroutines.launch
import kotlin.time.Duration
import kotlin.time.Duration.Companion.milliseconds

@Inject
@SingleIn(MatchScope::class)
class NetworkViewerSession(
    private val matchManager: MatchManager,
    private val scope: CoroutineScope,
    private val config: MatchConfig,
) : MatchObserver {

    private val _score = MutableStateFlow(Score(0, 0, null, null, null))
    override val score: StateFlow<Score> = _score.asStateFlow()
    private val _roundEvent = MutableStateFlow<RoundEvent?>(null)
    override val roundEvent: StateFlow<RoundEvent?> = _roundEvent.asStateFlow()
    override val hapticEvents: SharedFlow<HapticEvent> = MutableSharedFlow()
    private var countdownJob: Job? = null

    init {
        scope.launch {
            matchManager.observeCurrentMatch()
                .filterNotNull()
                .collect { match ->
                _score.value = deriveScoreFromMatch(match)
                val event = deriveRoundEventFromMatch(match)
                _roundEvent.value = event
                if (event?.state == RoundEvent.RoundState.STARTED) {
                    startCountdown(event)
                } else {
                    countdownJob?.cancel()
                    countdownJob = null
                }
            }
        }
    }

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
        }
    }

    private fun deriveRoundEventFromMatch(match: Match): RoundEvent? =
        deriveRoundEventFromMatch(match, config)
}
