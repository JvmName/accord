package dev.jvmname.accord.network

import io.ktor.client.engine.HttpClientEngineFactory
import io.ktor.client.engine.cio.CIO

actual fun createHttpEngine(): HttpClientEngineFactory<*> = CIO