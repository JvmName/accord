package dev.jvmname.accord.network

import co.touchlab.kermit.Logger
import dev.jvmname.accord.ui.catchRunning
import dev.jvmname.accord.ui.onEither
import dev.zacsweers.metro.AppScope
import dev.zacsweers.metro.AssistedFactory
import dev.zacsweers.metro.AssistedInject
import dev.zacsweers.metro.SingleIn
import io.socket.client.IO
import io.socket.client.Socket
import io.socket.emitter.Emitter
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.shareIn
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.decodeFromJsonElement
import org.json.JSONArray
import org.json.JSONObject

@AssistedInject
actual class SocketClient actual constructor(
    baseUrl: BaseUrl,
    token: ApiToken,
    private val json: Json,
    private val scope: CoroutineScope,
) {

    @[AssistedFactory SingleIn(AppScope::class)]
    actual interface Factory {
        actual fun create(token: ApiToken): SocketClient
    }

    private val socket: Socket

    private val matchFlows = mutableMapOf<MatchId, SharedFlow<Match>>()

    init {
        val options = IO.Options().apply {
            auth = mapOf("apiToken" to token.apiToken)
            transports = arrayOf("websocket")
            reconnectionDelay = 330
            //TODO websocketfactory
        }
        socket = IO.socket(baseUrl.baseUrl, options)
    }

    actual fun connect() {
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
                        success = { trySend(it) },
                        failure = { Logger.e(throwable = it) { "Websocket parse error: " } }
                    )
                }

                // Register listener and join match room
                socket.on("match.update", listener)
                socket.emit("match.join", matchId.id)

                awaitClose {
                    // Leave match room and unregister listener
                    socket.emit("match.leave", matchId.id)
                    socket.off("match.update", listener)
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