@file:OptIn(ExperimentalWasmJsInterop::class)

package dev.jvmname.accord.network

import kotlin.test.Test
import kotlin.test.assertEquals

class WasmJsInteropTest {

    @Test
    fun lambdaIdentityPreservedAcrossJsBoundary() {
        val tracker = makeTracker()

        val listener: (JsAny?) -> Unit = { /* no-op */ }

        addListener(tracker, listener)
        assertEquals(1, listenerCount(tracker), "listener should be registered")

        removeListener(tracker, listener)
        assertEquals(
            expected = 0,
            actual = listenerCount(tracker),
            message = "off() with same lambda val should deregister — " +
                "if this fails, the JS wrapper is not stable and the escape hatch is required"
        )
    }
}

// Each operation is its own single-line js() call to avoid multiline string issues.
// The tracker is a plain JS object with a _listeners array; we never use external interface
// to avoid function-type-in-external-interface edge cases in Kotlin/Wasm.

@Suppress("UNUSED_PARAMETER")
private fun makeTracker(): JsAny =
    js("({ _listeners: [] })")

@Suppress("UNUSED_PARAMETER")
private fun addListener(tracker: JsAny, fn: (JsAny?) -> Unit): Unit =
    js("tracker._listeners.push(fn)")

@Suppress("UNUSED_PARAMETER")
private fun removeListener(tracker: JsAny, fn: (JsAny?) -> Unit): Unit =
    js("tracker._listeners = tracker._listeners.filter(function(f) { return f !== fn; })")

@Suppress("UNUSED_PARAMETER")
private fun listenerCount(tracker: JsAny): Int =
    js("tracker._listeners.length")
