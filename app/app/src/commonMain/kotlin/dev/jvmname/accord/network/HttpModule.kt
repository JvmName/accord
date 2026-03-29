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
import io.ktor.client.plugins.logging.LogLevel
import io.ktor.client.plugins.logging.Logger
import io.ktor.client.plugins.logging.Logging
import io.ktor.client.plugins.plugin
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.encodedPath
import io.ktor.serialization.kotlinx.json.json
import io.ktor.util.appendIfNameAbsent
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
                headers.appendIfNameAbsent(
                    HttpHeaders.ContentType,
                    ContentType.Application.Json.toString()
                )
            }
            install(Logging) {
                logger = object : Logger {
                    override fun log(message: String) {
                        co.touchlab.kermit.Logger.i { "AccordClient: $message" }
                    }
                }
                level = LogLevel.ALL
            }
        }.also {
            it.plugin(HttpSend).intercept({ request ->
                val authToken = prefs.getAuthToken()
                if (!request.url.encodedPath.endsWith("/users") && authToken != null) {
                    request.headers.append("X-Api-Token", authToken.token)
                }
                execute(request)
            })
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


