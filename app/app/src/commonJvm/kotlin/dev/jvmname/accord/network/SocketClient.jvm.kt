package dev.jvmname.accord.network

import co.touchlab.kermit.Logger
import dev.jvmname.accord.ui.catchRunning
import dev.jvmname.accord.ui.onEither
import dev.zacsweers.metro.*
import io.socket.client.IO
import io.socket.client.Socket
import io.socket.emitter.Emitter
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.*
import kotlinx.serialization.json.*
import org.json.JSONArray
import org.json.JSONObject

@AssistedInject
actual class SocketClient actual constructor(
    private val baseUrl: BaseUrl,
    @Assisted token: AuthToken,
    private val json: Json,
    private val scope: CoroutineScope,
) {

    @[AssistedFactory SingleIn(AppScope::class)]
    actual interface Factory {
        actual fun create(token: AuthToken): SocketClient
    }

    private val log = Logger.withTag("Net/Socket")

    private val socket: Socket

    private val matchFlows = mutableMapOf<MatchId, SharedFlow<Match>>()

    init {
        val options = IO.Options().apply {
            auth = mapOf("apiToken" to token.token)
            transports = arrayOf("websocket")
            reconnectionDelay = 330
            //TODO websocketfactory
        }
        socket = IO.socket(baseUrl.baseUrl, options)

        socket.on(Socket.EVENT_CONNECT) {
            log.i { "socket connected" }
        }
        socket.on(Socket.EVENT_DISCONNECT) { args ->
            val reason = args?.firstOrNull()?.toString() ?: "unknown"
            log.i { "socket disconnected reason=$reason" }
        }
        socket.on(Socket.EVENT_CONNECT_ERROR) { args ->
            val error = args?.firstOrNull()?.toString() ?: "unknown"
            log.e { "socket connect error: $error" }
        }
    }

    actual fun connect() {
        log.i { "connecting to ${baseUrl.baseUrl}" }
        if (!socket.connected()) {
            socket.connect()
        }
    }

    actual fun disconnect() {
        if (socket.connected()) {
            socket.disconnect()
        }
    }

    actual fun observeMatch(matchId: MatchId): Flow<Match> = synchronized(matchFlows) {
        matchFlows.getOrPut(matchId) {
            callbackFlow {
                val listener = Emitter.Listener { args ->
                    catchRunning {
                        val el = args[0].toJsonElement()
                        json.decodeFromJsonElement<Match>(el)
                    }.onEither(
                        success = { match ->
                            log.d { "match update matchId=$matchId rounds=${match.rounds.size}" }
                            trySend(match)
                        },
                        failure = { error ->
                            val rawSnippet = args?.firstOrNull()?.toString()
                            log.e(throwable = error) { "Websocket parse error matchId=$matchId raw=$rawSnippet" }
                        }
                    )
                }

                // Register listener and join match room
                log.i { "joining room match:$matchId" }
                socket.on("match.update", listener)
                    .on("round.tech-fall", listener)
                    .on("break.ended", listener)
                    .emit("match.join", matchId.id)

                awaitClose {
                    // Leave match room and unregister listener
                    log.i { "leaving room match:$matchId" }
                    socket.emit("match.leave", matchId.id)
                    socket.off("match.update", listener)
                    socket.off("round.tech-fall", listener)
                    socket.off("break.ended", listener)
                }
            }.shareIn(
                scope = scope,
                started = SharingStarted.WhileSubscribed(
                    stopTimeoutMillis = 5000,
                    replayExpirationMillis = 0
                ),
                replay = 1
            )
        }
    }

    actual fun isConnected(): Boolean = socket.connected()
}


private fun Any?.toJsonElement(): JsonElement {
    return when (this) {
        null -> JsonNull
        is JSONObject -> buildJsonObject {
            keys().forEach { k ->
                val key = k.toString()
                put(key, get(key).mapJsonValue())
            }
        }

        is JSONArray -> buildJsonArray {
            repeat(length()) { i ->
                add(get(i).mapJsonValue())
            }
        }

        else -> TODO("unknown type: $this")
    }
}

private fun Any?.mapJsonValue(): JsonElement = when (this) {
    null, JSONObject.NULL -> JsonNull
    is JSONObject, is JSONArray -> this.toJsonElement()
    is Number -> JsonPrimitive(this)
    is String -> JsonPrimitive(this)
    is Boolean -> JsonPrimitive(this)
    is Char -> JsonPrimitive(this.toString())
    else -> TODO("unknown type: $this")
}