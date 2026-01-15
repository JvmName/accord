package dev.jvmname.accord.domain

import com.github.michaelbull.result.onSuccess
import dev.jvmname.accord.network.AccordClient
import dev.jvmname.accord.network.CompetitorColor
import dev.jvmname.accord.network.Match
import dev.jvmname.accord.network.MatchId
import dev.jvmname.accord.network.NetworkResult
import dev.jvmname.accord.network.UserId
import dev.jvmname.accord.prefs.Prefs
import dev.zacsweers.metro.Inject
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

@Inject
class MatchManager(
    private val prefs: Prefs,
    private val client: AccordClient,
) {
    // In-memory cache for frequently accessed match details
    private val matchCache = mutableMapOf<MatchId, Match>()
    private val cacheMutex = Mutex()

    /**
     * Create a new match with red and blue competitors.
     * Caches the match in memory and optionally in Prefs if it becomes the current match.
     */
    suspend fun createMatch(
        matCode: String,
        redCompetitorId: UserId,
        blueCompetitorId: UserId
    ): NetworkResult<Match> {
        return client.createMatch(matCode, redCompetitorId, blueCompetitorId)
            .onSuccess { match ->
                cacheMatch(match)
            }
    }

    /**
     * Get match details by match ID.
     * Uses in-memory cache when available, otherwise fetches from server.
     */
    suspend fun getMatch(matchId: MatchId, useCache: Boolean = true): NetworkResult<Match> {
        // Check cache first if enabled
        if (useCache) {
            cacheMutex.withLock {
                matchCache[matchId]?.let { return com.github.michaelbull.result.Ok(it) }
            }
        }

        return client.getMatch(matchId)
            .onSuccess { match ->
                cacheMatch(match)
            }
    }

    /**
     * Start a match. This sets started_at timestamp, copies judges from mat,
     * and creates the first round automatically.
     * Updates current match in Prefs.
     */
    suspend fun startMatch(matchId: MatchId): NetworkResult<Match> {
        return client.startMatch(matchId)
            .onSuccess { match ->
                cacheMatch(match)
                prefs.updateCurrentMatch(match)
            }
    }

    /**
     * End a match with optional submission details.
     * Clears current match from Prefs when ended.
     */
    suspend fun endMatch(
        matchId: MatchId,
        submission: String? = null,
        submitter: CompetitorColor? = null
    ): NetworkResult<Match> {
        return client.endMatch(matchId, submission, submitter)
            .onSuccess { match ->
                cacheMatch(match)
                // Clear current match from prefs since match ended
                prefs.updateCurrentMatch(null)
            }
    }

    /**
     * Start a new round in the match.
     * Can only start if previous round has ended.
     */
    suspend fun startRound(matchId: MatchId): NetworkResult<Match> {
        return client.startRound(matchId)
            .onSuccess { match ->
                cacheMatch(match)
                // Update current match since rounds changed
                updateCurrentMatchIfActive(match)
            }
    }

    /**
     * End the current round with optional submission details.
     */
    suspend fun endRound(
        matchId: MatchId,
        submission: String? = null,
        submitter: CompetitorColor? = null
    ): NetworkResult<Match> {
        return client.endRound(matchId, submission, submitter)
            .onSuccess { match ->
                cacheMatch(match)
                updateCurrentMatchIfActive(match)
            }
    }

    /**
     * Observe the current active match from Prefs.
     */
    fun observeCurrentMatch(): Flow<Match?> = prefs.observeCurrentMatch()

    /**
     * Clear all cached match data.
     */
    suspend fun clearCache() {
        cacheMutex.withLock {
            matchCache.clear()
        }
    }

    /**
     * Clear specific match from cache.
     */
    suspend fun clearMatchFromCache(matchId: MatchId) {
        cacheMutex.withLock {
            matchCache.remove(matchId)
        }
    }

    private suspend fun cacheMatch(match: Match) {
        cacheMutex.withLock {
            matchCache[match.id] = match
        }
    }

    private suspend fun updateCurrentMatchIfActive(match: Match) {
        // Only update prefs if match is currently active (started but not ended)
        if (match.startedAt != null && match.endedAt == null) {
            prefs.updateCurrentMatch(match)
        }
    }
}
