package dev.jvmname.accord.network

import dev.zacsweers.metro.AppScope
import dev.zacsweers.metro.ContributesTo
import dev.zacsweers.metro.Provides
import dev.zacsweers.metro.SingleIn
import io.ktor.client.HttpClient
import io.ktor.client.engine.HttpClientEngineFactory
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.plugins.websocket.WebSockets
import io.ktor.serialization.kotlinx.KotlinxWebsocketSerializationConverter
import io.ktor.serialization.kotlinx.json.json
import kotlinx.serialization.json.Json
import kotlin.time.Duration.Companion.seconds

@ContributesTo(AppScope::class)
interface HttpModule {
    @[Provides SingleIn(AppScope::class)]
    fun httpClient(json: Json): HttpClient {
        return HttpClient(createHttpEngine()) {
            install(ContentNegotiation) {
                json(json)
            }
            install(WebSockets) {
                pingIntervalMillis = 10.seconds.inWholeMilliseconds
                contentConverter = KotlinxWebsocketSerializationConverter(json)
            }
        }
    }

    @[Provides SingleIn(AppScope::class)]
    fun provideJson(): Json {
        return Json {
            prettyPrint = true
//        isLenient = true
            useAlternativeNames = false
        }
    }
}


expect fun createHttpEngine(): HttpClientEngineFactory<*>


