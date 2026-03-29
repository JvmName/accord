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