package dev.jvmname.accord.network

import io.ktor.client.engine.HttpClientEngineFactory
import io.ktor.client.engine.js.Js
//actual fun createHttpEngine(): HttpClientEngineFactory<*> = CIO
actual fun createHttpEngine(): HttpClientEngineFactory<*> {
    return Js
}