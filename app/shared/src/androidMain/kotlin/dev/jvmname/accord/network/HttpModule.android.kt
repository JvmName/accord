package dev.jvmname.accord.network

import io.ktor.client.engine.HttpClientEngineFactory
import io.ktor.client.engine.okhttp.OkHttp

actual fun createHttpEngine(): HttpClientEngineFactory<*> = OkHttp