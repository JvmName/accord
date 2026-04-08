package dev.jvmname.accord.network

import androidx.compose.ui.util.fastFirst
import dev.jvmname.accord.domain.Competitor
import dev.jvmname.accord.ui.session.judging.MatchResult

val Mat.adminCode: MatCode
    get() = codes.fastFirst { it.role == Role.ADMIN }

val Mat.viewerCode: MatCode
    get() = codes.fastFirst { it.role == Role.VIEWER }

/**
 * Returns a new [Mat] with fields from [other] overlaid onto this one, preferring non-empty
 * collections from either side. Useful when an endpoint returns a partial mat (e.g. the join
 * endpoint omits [Mat.codes]) and we need to preserve data from a prior fetch.
 */
fun Mat.merge(other: Mat): Mat = Mat(
    id = id,
    name = name,
    judgeCount = judgeCount,
    creatorId = creatorId,
    judges = judges.ifEmpty { other.judges },
    codes = codes.ifEmpty { other.codes },
    currentMatch = currentMatch ?: other.currentMatch,
    upcomingMatches = upcomingMatches.ifEmpty { other.upcomingMatches },
)

/**
 * Returns a new [Match] with fields from [other] used as fallback for absent optional associations.
 * Some endpoints (e.g. pause/resume) omit `judges` because they pass `includeJudges` instead of
 * `includeMatchJudges` — merge preserves the previously cached value in that case.
 */
/**
 * Returns the [Competitor] who won the round at [roundIndex], or null if the round has no winner.
 */
fun Match.winner(roundIndex: Int): Competitor? = when (rounds[roundIndex].result.winner?.id) {
    red.id -> Competitor.RED
    blue.id -> Competitor.BLUE
    else -> null
}

val Match.winnerCompetitor: Competitor?
    get() = when (winner?.id) {
        red.id -> Competitor.RED
        blue.id -> Competitor.BLUE
        else -> null
    }

/**
 * Returns the total rounds-won score for each competitor across all completed rounds.
 */
fun Match.roundScore(): Map<Competitor, Int> = mapOf(
    Competitor.RED to rounds.count { it.result.winner?.id == red.id },
    Competitor.BLUE to rounds.count { it.result.winner?.id == blue.id },
)

fun Match.merge(other: Match): Match = Match(
    id = id,
    creatorId = creatorId,
    matId = matId,
    startedAt = startedAt,
    endedAt = endedAt,
    red = red,
    blue = blue,
    winner = winner,
    mat = mat ?: other.mat,
    judges = judges.ifEmpty { other.judges },
    rounds = rounds.ifEmpty { other.rounds },
)

val RoundResultType.toHumanString: String
    get() = when (this) {
        RoundResultType.SUBMISSION -> "Submission"
        RoundResultType.STOPPAGE -> "Stoppage"
        RoundResultType.POINTS -> "Decision"
        RoundResultType.TIE -> "Tie"
        RoundResultType.TECH_FALL -> "Techfall"
    }

fun Match.toMatchResult(): MatchResult? {
    val winner = winner!!
    val winnerC = winnerCompetitor ?: return null
    val scores = roundScore()
    val loser = if (winnerC == Competitor.RED) Competitor.BLUE else Competitor.RED
    return MatchResult(
        winner = winner to winnerC,
        winnerScore = scores[winnerC] ?: 0,
        loserScore = scores[loser] ?: 0,
        winConditions = rounds
            .filter { it.endedAt != null && it.result.winner == winner && it.result.method.type != null }
            .joinToString { it.result.method.type!!.toHumanString }
    )
}
