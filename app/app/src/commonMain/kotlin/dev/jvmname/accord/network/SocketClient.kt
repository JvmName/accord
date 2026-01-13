package dev.jvmname.accord.network

import dev.zacsweers.metro.AppScope
import dev.zacsweers.metro.AssistedFactory
import dev.zacsweers.metro.AssistedInject
import dev.zacsweers.metro.SingleIn
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.Flow
import kotlinx.serialization.json.Json

@JvmInline
value class BaseUrl(val baseUrl: String)

@JvmInline
value class ApiToken(val apiToken: String)

/** Socket.IO client for real-time match updates. */
@AssistedInject
expect class SocketClient(
    baseUrl: BaseUrl,
    token: ApiToken,
    json: Json,
    scope: CoroutineScope
) {
    @[AssistedFactory SingleIn(AppScope::class)]
     interface Factory {
        fun create(token: ApiToken): SocketClient
    }

    /**
     * Connect to the Socket.IO server.
     * Must be called before observing matches.
     */
    fun connect()

    /**
     * Disconnect from the Socket.IO server.
     * All active match observations will be stopped.
     */
    fun disconnect()

    /**
     * Observe real-time updates for a specific match.
     *
     * Automatically joins the match room on collection and leaves on cancellation.
     * Updates are received approximately every 1 second while the match is active.
     *
     * @param matchId The match to observe
     * @return Flow of match updates (riding times are live-calculated)
     */
    fun observeMatch(matchId: MatchId): Flow<Match>

    /**
     * Check if the client is currently connected.
     */
    fun isConnected(): Boolean
}
