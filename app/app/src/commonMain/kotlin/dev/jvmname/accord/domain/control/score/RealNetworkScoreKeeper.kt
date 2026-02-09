package dev.jvmname.accord.domain.control.score

import co.touchlab.kermit.Logger
import dev.jvmname.accord.di.ForControlType
import dev.jvmname.accord.di.MatchScope
import dev.jvmname.accord.domain.Competitor
import dev.jvmname.accord.domain.MatchManager
import dev.jvmname.accord.domain.control.ButtonEvent
import dev.jvmname.accord.domain.control.ButtonPressTracker
import dev.jvmname.accord.network.CompetitorColor
import dev.jvmname.accord.network.Match
import dev.jvmname.accord.ui.control.ControlTimeEvent.ManualPointEdit
import dev.jvmname.accord.ui.control.ControlTimeType
import dev.zacsweers.metro.ContributesBinding
import dev.zacsweers.metro.Inject
import dev.zacsweers.metro.SingleIn
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.launch

/**
 * ScoreKeeper for consensus mode that:
 * - Collects button events and sends voting API calls
 * - Derives score from network match state (server is authoritative)
 */
@Inject
@SingleIn(MatchScope::class)
@ContributesBinding(MatchScope::class)
@ForControlType(ControlTimeType.CONSENSUS)
class RealNetworkScoreKeeper(
    private val matchManager: MatchManager,
    tracker: ButtonPressTracker,
    scope: CoroutineScope,
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

    init {
        // Collect button events and send voting API calls
        tracker.buttonEvents
            .onEach { event ->
                when (event) {
                    is ButtonEvent.Holding -> {
                        val color = event.competitor.toCompetitorColor()
                        Logger.d { "NetworkScoreKeeper: Button holding for $color, calling startRidingTimeVote" }
                        val match = matchManager.observeCurrentMatch().filterNotNull().first()
                        scope.launch {
                            matchManager.startRidingTimeVote(match.id, color)
                        }
                    }

                    is ButtonEvent.Release -> {
                        val color = event.competitor.toCompetitorColor()
                        Logger.d { "NetworkScoreKeeper: Button released for $color, calling endRidingTimeVote" }
                        val match = matchManager.observeCurrentMatch().filterNotNull().first()
                        scope.launch {
                            matchManager.endRidingTimeVote(match.id, color)
                        }
                    }

                    else -> {
                        // Ignore Press and SteadyState events
                    }
                }
            }
            .launchIn(scope)

        // Derive score from network match state
        matchManager.observeCurrentMatch()
            .filterNotNull()
            .onEach { match ->
                _score.value = deriveScoreFromMatch(match)
            }
            .launchIn(scope)
    }

    override fun resetScores() {
        // No-op in consensus mode - server is authoritative
        Logger.d { "NetworkScoreKeeper: resetScores() is a no-op in consensus mode" }
    }

    override fun manualEdit(competitor: Competitor, action: ManualPointEdit.Action) {
        // No-op in consensus mode - server is authoritative
        Logger.d { "NetworkScoreKeeper: manualEdit() is a no-op in consensus mode" }
    }

    private fun deriveScoreFromMatch(match: Match): Score {
        val activeRound = match.rounds.lastOrNull { it.endedAt == null }
        val scoreMap = activeRound?.score.orEmpty()
        val redPoints = scoreMap.getOrElse(match.red.id) { 0 }
        val bluePoints = scoreMap.getOrElse(match.blue.id) { 0 }

        // Check for techfall from round result
        val techFallWin = if (activeRound?.result?.winner != null) {
            when (activeRound.result.winner.id) {
                match.red.id -> Competitor.RED
                match.blue.id -> Competitor.BLUE
                else -> null
            }
        } else null

        return Score(
            redPoints = redPoints,
            bluePoints = bluePoints,
            activeControlTime = null, // Server calculates score; no local active control tracking
            activeCompetitor = null,
            techFallWin = techFallWin
        )
    }
}

private fun Competitor.toCompetitorColor(): CompetitorColor = when (this) {
    Competitor.RED -> CompetitorColor.RED
    Competitor.BLUE -> CompetitorColor.BLUE
}
