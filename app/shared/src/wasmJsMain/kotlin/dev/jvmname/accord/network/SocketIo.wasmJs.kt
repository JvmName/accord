@file:JsModule("socket.io-client")
@file:OptIn(ExperimentalWasmJsInterop::class)

package dev.jvmname.accord.network

external fun io(url: String, options: JsAny): JsSocket

external class JsSocket {
    val connected: Boolean

    fun connect(): JsSocket
    fun disconnect(): JsSocket

    fun on(event: String, listener: (JsAny?) -> Unit): JsSocket
    fun off(event: String, listener: (JsAny?) -> Unit): JsSocket

    fun emit(event: String): JsSocket
    fun emit(event: String, data: String): JsSocket
}
