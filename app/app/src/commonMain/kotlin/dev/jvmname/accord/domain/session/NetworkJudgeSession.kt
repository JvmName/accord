package dev.jvmname.accord.domain.session

import co.touchlab.kermit.Logger
import dev.jvmname.accord.di.MatchScope
import dev.jvmname.accord.domain.Competitor
import dev.jvmname.accord.domain.MatchManager
import dev.jvmname.accord.domain.control.ButtonEvent
import dev.jvmname.accord.domain.control.ButtonPressTracker
import dev.jvmname.accord.domain.control.HapticEvent
import dev.jvmname.accord.domain.control.ScoreHapticFeedbackHelper
import dev.jvmname.accord.domain.control.rounds.MatchConfig
import dev.jvmname.accord.domain.control.rounds.RoundEvent
import dev.jvmname.accord.domain.control.score.Score
import dev.jvmname.accord.network.CompetitorColor
import dev.jvmname.accord.network.MatchId
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
class NetworkJudgeSession(
    private val matchManager: MatchManager,
    private val buttonPressTracker: ButtonPressTracker,
    private val hapticFactory: ScoreHapticFeedbackHelper.Factory,
    private val scope: CoroutineScope,
    private val config: MatchConfig,
) : JudgingSession {

    private val log = Logger.withTag("Session/JudgeSession")

    private var currentMatchId: MatchId? = null
    private val _score = MutableStateFlow(Score(0, 0, null, null, null))
    override val score: StateFlow<Score> = _score.asStateFlow()
    private val _roundEvent = MutableStateFlow<RoundEvent?>(null)
    override val roundEvent: StateFlow<RoundEvent?> = _roundEvent.asStateFlow()
    private var countdownJob: Job? = null

    private val hapticHelper = hapticFactory.create(
        buttonEvents = buttonPressTracker.buttonEvents,
        score = _score,
    )
    override val hapticEvents: SharedFlow<HapticEvent> = hapticHelper.hapticEvents

    private var activeVote: Competitor? = null

    init {
        scope.launch {
            matchManager.observeCurrentMatch()
                .filterNotNull()
                .collect { match ->
                    currentMatchId = match.id
                    _score.update { deriveScoreFromMatch(match) }
                    val event = deriveRoundEventFromMatch(match, config)
                    _roundEvent.value = event
                    if (event?.state == RoundEvent.RoundState.STARTED) {
                        startCountdown(event.remaining)
                    } else {
                        countdownJob?.cancel()
                        countdownJob = null
                    }
                }
        }

        scope.launch {
            buttonPressTracker.buttonEvents.collect { event ->
                when (event) {
                    is ButtonEvent.Holding -> {
                        if(activeVote != null) {
                            log.d { "button continue held → (no network call) competitor=${event.competitor}" }
                            return@collect
                        }
                        activeVote = event.competitor
                        scope.launch {
                            log.d { "button started held → startVote competitor=${event.competitor}" }
                            currentMatchId?.let {
                                matchManager.startRidingTimeVote(it, event.competitor.toCompetitorColor())
                            }
                        }
                    }

                    is ButtonEvent.SteadyState -> {
                        val vote = activeVote ?: return@collect
                        activeVote = null
                        scope.launch {
                            log.d { "button released → endVote competitor=${vote}" }
                            currentMatchId?.let {
                                matchManager.endRidingTimeVote(
                                    it,
                                    vote.toCompetitorColor()
                                )
                            }
                        }
                    }

                    else -> Unit
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

    override fun pause() {
        scope.launch { currentMatchId?.let { matchManager.pauseRound(it) } }
    }

    override fun resume() {
        scope.launch { currentMatchId?.let { matchManager.resumeRound(it) } }
    }

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

    private fun Competitor.toCompetitorColor(): CompetitorColor = when (this) {
        Competitor.RED -> CompetitorColor.RED
        Competitor.BLUE -> CompetitorColor.BLUE
    }
}
