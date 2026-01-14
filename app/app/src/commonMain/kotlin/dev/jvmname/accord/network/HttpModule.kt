package dev.jvmname.accord.network

import dev.jvmname.accord.prefs.Prefs
import dev.zacsweers.metro.AppScope
import dev.zacsweers.metro.ContributesTo
import dev.zacsweers.metro.Provides
import dev.zacsweers.metro.SingleIn
import io.ktor.client.HttpClient
import io.ktor.client.engine.HttpClientEngineFactory
import io.ktor.client.plugins.DefaultRequest
import io.ktor.client.plugins.HttpSend
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.plugins.plugin
import io.ktor.http.encodedPath
import io.ktor.serialization.kotlinx.json.json
import kotlinx.serialization.json.Json

@ContributesTo(AppScope::class)
interface HttpModule {
    @[Provides SingleIn(AppScope::class)]
    fun httpClient(baseUrl: BaseUrl, json: Json, prefs: Prefs): HttpClient {
        return HttpClient(createHttpEngine()) {
            install(ContentNegotiation) {
                json(json)
            }
            install(DefaultRequest) {
                url(baseUrl.baseUrl)
            }
        }.also {
            it.plugin(HttpSend).intercept { request ->
                if (!request.url.encodedPath.endsWith("/users")) {
                    request.headers.append("X-Api-Token", prefs.getAuthToken()!!)
                }
                execute(request)
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


