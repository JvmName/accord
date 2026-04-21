@file:OptIn(ExperimentalWasmJsInterop::class)

package dev.jvmname.accord.network

import kotlin.test.Test
import kotlin.test.assertEquals

class WasmJsInteropTest {

    @Test
    fun lambdaIdentityPreservedAcrossJsBoundary() {
        val tracker = makeTracker()

        val listener: (JsAny?) -> Unit = { /* no-op */ }

        tracker.addListener(listener)
        assertEquals(1, tracker.listenerCount(), "listener should be registered")

        tracker.removeListener(listener)
        assertEquals(
            expected = 0,
            actual = tracker.listenerCount(),
            message = "off() with same lambda val should deregister — " +
                "if this fails, the JS wrapper is not stable and the escape hatch is required"
        )
    }
}

// JS tracker that mimics the socket.on/off contract using strict reference equality (===)
private fun makeTracker(): JsTracker = js("""({
    _listeners: [],
    addListener(fn)    { this._listeners.push(fn) },
    removeListener(fn) { this._listeners = this._listeners.filter(f => f !== fn) },
    listenerCount()    { return this._listeners.length }
})""")

// No @JsModule needed — object is created inline via js(), not imported from a module
external interface JsTracker : JsAny {
    fun addListener(fn: (JsAny?) -> Unit)
    fun removeListener(fn: (JsAny?) -> Unit)
    fun listenerCount(): Int
}
