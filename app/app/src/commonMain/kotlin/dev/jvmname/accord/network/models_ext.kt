package dev.jvmname.accord.network

import androidx.compose.ui.util.fastFirst

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