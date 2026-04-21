@file:OptIn(ExperimentalWasmJsInterop::class)

package dev.jvmname.accord.network

import co.touchlab.kermit.Logger
import dev.zacsweers.metro.AppScope
import dev.zacsweers.metro.Assisted
import dev.zacsweers.metro.AssistedFactory
import dev.zacsweers.metro.AssistedInject
import dev.zacsweers.metro.SingleIn
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.shareIn
import kotlinx.serialization.json.Json

// Must be top-level here (not in SocketIo.wasmJs.kt which has @file:JsModule)
@Suppress("UNUSED_PARAMETER")
private fun makeSocketOptions(apiToken: String): JsAny =
    js("({ auth: { apiToken: apiToken }, transports: ['websocket'], reconnectionDelay: 330 })")

@Suppress("UNUSED_PARAMETER")
private fun jsonStringify(obj: JsAny): String = js("JSON.stringify(obj)")

@Suppress("UNUSED_PARAMETER")
private fun jsToString(obj: JsAny): String = js("String(obj)")

@Suppress("UNUSED_PARAMETER")
private fun jsErrorMessage(err: JsAny): String = js("err.message || String(err)")

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
    private val socket: JsSocket = io(baseUrl.baseUrl, makeSocketOptions(token.token))
    private val matchFlows = mutableMapOf<MatchId, SharedFlow<Match>>()

    init {
        socket.on("connect") {
            log.i { "socket connected" }
        }
        socket.on("disconnect") { args ->
            val reason = args?.let { jsToString(it) } ?: "unknown"
            log.i { "socket disconnected reason=$reason" }
        }
        socket.on("connect_error") { args ->
            val error = args?.let { jsErrorMessage(it) } ?: "unknown"
            log.e { "socket connect error: $error" }
        }
    }

    actual fun connect() {
        if (!socket.connected) socket.connect()
    }

    actual fun disconnect() {
        if (socket.connected) socket.disconnect()
    }

    actual fun observeMatch(matchId: MatchId): Flow<Match> =
        matchFlows.getOrPut(matchId) {
            callbackFlow {
                val listener: (JsAny?) -> Unit = { args ->
                    try {
                        if (args != null) {
                            val jsonString = jsonStringify(args)
                            val match = json.decodeFromString<Match>(jsonString)
                            trySend(match)
                        }
                    } catch (e: Exception) {
                        log.e(throwable = e) { "parse error" }
                    }
                }
                socket.on("match.update", listener)
                    .on("round.tech-fall", listener)
                    .on("break.ended", listener)
                    .emit("match.join", matchId.id)
                awaitClose {
                    socket.emit("match.leave", matchId.id)
                    socket.off("match.update", listener)
                    socket.off("round.tech-fall", listener)
                    socket.off("break.ended", listener)
                }
            }.shareIn(scope, SharingStarted.WhileSubscribed(5000, 0), replay = 1)
        }

    actual fun isConnected(): Boolean = socket.connected
}
