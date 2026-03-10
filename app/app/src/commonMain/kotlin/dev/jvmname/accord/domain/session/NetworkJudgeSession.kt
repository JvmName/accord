package dev.jvmname.accord.domain.session

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
import dev.jvmname.accord.network.Match
import dev.jvmname.accord.network.MatchId
import dev.zacsweers.metro.Inject
import dev.zacsweers.metro.SingleIn
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

@Inject
@SingleIn(MatchScope::class)
class NetworkJudgeSession(
    private val matchManager: MatchManager,
    private val buttonPressTracker: ButtonPressTracker,
    private val hapticFactory: ScoreHapticFeedbackHelper.Factory,
    private val scope: CoroutineScope,
    private val config: MatchConfig,
) : JudgingSession {

    private var currentMatchId: MatchId? = null
    private val _score = MutableStateFlow(Score(0, 0, null, null, null))
    override val score: StateFlow<Score> = _score.asStateFlow()
    private val _roundEvent = MutableStateFlow<RoundEvent?>(null)
    override val roundEvent: StateFlow<RoundEvent?> = _roundEvent.asStateFlow()

    private val hapticHelper = hapticFactory.create(
        buttonEvents = buttonPressTracker.buttonEvents,
        score = _score,
    )
    override val hapticEvents: SharedFlow<HapticEvent> = hapticHelper.hapticEvents

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
            buttonPressTracker.buttonEvents.collect { event ->
                when (event) {
                    is ButtonEvent.Holding -> scope.launch {
                        currentMatchId?.let { matchManager.startRidingTimeVote(it, event.competitor.toCompetitorColor()) }
                    }
                    is ButtonEvent.Release -> scope.launch {
                        currentMatchId?.let { matchManager.endRidingTimeVote(it, event.competitor.toCompetitorColor()) }
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

    private fun deriveRoundEventFromMatch(match: Match): RoundEvent? =
        deriveRoundEventFromMatch(match, config)

    private fun Competitor.toCompetitorColor(): CompetitorColor = when (this) {
        Competitor.RED -> CompetitorColor.RED
        Competitor.BLUE -> CompetitorColor.BLUE
    }
}
