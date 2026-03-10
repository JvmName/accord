package dev.jvmname.accord.domain.session

import dev.jvmname.accord.domain.Competitor
import dev.jvmname.accord.domain.control.rounds.MatchConfig
import dev.jvmname.accord.domain.control.rounds.RoundEvent
import dev.jvmname.accord.domain.control.rounds.RoundInfo
import dev.jvmname.accord.domain.control.score.Score
import dev.jvmname.accord.network.Match
import dev.jvmname.accord.network.remainingDuration
import kotlin.time.Duration

internal fun deriveScoreFromMatch(match: Match): Score {
    val activeRound = match.rounds.lastOrNull { it.endedAt == null }
    val scoreMap = activeRound?.score.orEmpty()
    val redPoints = scoreMap.getOrElse(match.red.id) { 0 }
    val bluePoints = scoreMap.getOrElse(match.blue.id) { 0 }
    val techFallWin = activeRound?.result?.winner?.id?.let { winnerId ->
        when (winnerId) {
            match.red.id -> Competitor.RED
            match.blue.id -> Competitor.BLUE
            else -> null
        }
    }
    return Score(
        redPoints = redPoints,
        bluePoints = bluePoints,
        activeControlTime = null,
        activeCompetitor = null,
        techFallWin = techFallWin,
    )
}

internal fun deriveRoundEventFromMatch(match: Match, config: MatchConfig): RoundEvent? {
    val activeRound = match.rounds.lastOrNull { it.endedAt == null }
    val totalRounds = config.rounds.count { it is RoundInfo.Round }
    return when {
        activeRound != null -> {
            val roundNumber = match.rounds.size
            val roundInfo = config.getRound(roundNumber)
                ?: RoundInfo.Round(index = roundNumber, maxPoints = 0, duration = Duration.ZERO)
            RoundEvent(
                remaining = activeRound.remainingDuration ?: Duration.ZERO,
                roundNumber = roundNumber,
                totalRounds = totalRounds,
                round = roundInfo,
                state = RoundEvent.RoundState.STARTED,
            )
        }
        match.endedAt != null -> {
            val roundNumber = match.rounds.size
            RoundEvent(
                remaining = Duration.ZERO,
                roundNumber = roundNumber,
                totalRounds = totalRounds,
                round = RoundInfo.Round(index = roundNumber, maxPoints = 0, duration = Duration.ZERO),
                state = RoundEvent.RoundState.MATCH_ENDED,
            )
        }
        else -> null
    }
}
