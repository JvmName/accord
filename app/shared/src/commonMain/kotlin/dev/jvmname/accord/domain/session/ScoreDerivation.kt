package dev.jvmname.accord.domain.session

import dev.jvmname.accord.domain.Competitor
import dev.jvmname.accord.domain.control.rounds.MatchConfig
import dev.jvmname.accord.domain.control.rounds.RoundEvent
import dev.jvmname.accord.domain.control.rounds.RoundEvent.RoundState
import dev.jvmname.accord.domain.control.rounds.RoundInfo
import dev.jvmname.accord.domain.control.score.Score
import dev.jvmname.accord.network.Match
import dev.jvmname.accord.network.remainingDuration
import kotlin.time.Clock
import kotlin.time.Duration
import kotlin.time.Duration.Companion.seconds

internal fun deriveScoreFromMatch(match: Match): Score {
    val activeRound = match.rounds.lastOrNull { it.endedAt == null }
    val scoreMap = activeRound?.score.orEmpty()
    val redPoints = scoreMap.getOrElse(match.red.id) { 0 }
    val bluePoints = scoreMap.getOrElse(match.blue.id) { 0 }
    val techFallWin = activeRound?.result?.winner?.id?.let { winnerId ->
        when (winnerId) {
            match.red.id -> Competitor.Orange
            match.blue.id -> Competitor.Green
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
                remaining = activeRound.remainingDuration ?: activeRound.maxDuration.seconds,
                roundNumber = roundNumber,
                totalRounds = totalRounds,
                round = roundInfo,
                state = if (activeRound.paused) RoundState.PAUSED else RoundState.STARTED,
            )
        }
        match.endedAt != null -> {
            val roundNumber = match.rounds.size
            RoundEvent(
                remaining = Duration.ZERO,
                roundNumber = roundNumber,
                totalRounds = totalRounds,
                round = RoundInfo.Round(index = roundNumber, maxPoints = 0, duration = Duration.ZERO),
                state = RoundState.MATCH_ENDED,
            )
        }
        else -> {
            // Between rounds: round N just ended, round N+1 hasn't started — count down the break.
            val completedRounds = match.rounds.size
            val completedRoundInfo = config.getRound(completedRounds) ?: return null
            val breakInfo = config.rounds
                .getOrNull(config.rounds.indexOf(completedRoundInfo) + 1) as? RoundInfo.Break
                ?: return null
            val remaining = if (match.breakRemaining != null) {
                match.breakRemaining.seconds
            } else {
                val lastRound = match.rounds.lastOrNull() ?: return null
                val elapsed = Clock.System.now() - lastRound.endedAt!!
                (breakInfo.duration - elapsed).coerceAtLeast(Duration.ZERO)
            }
            RoundEvent(
                remaining = remaining,
                roundNumber = completedRounds,
                totalRounds = totalRounds,
                round = breakInfo,
                state = if (remaining > Duration.ZERO) RoundState.STARTED else RoundState.ENDED,
            )
        }
    }
}
