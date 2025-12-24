package dev.jvmname.accord.network

import dev.jvmname.accord.network.model.CreateMatRequest
import dev.zacsweers.metro.AppScope
import dev.zacsweers.metro.Inject
import dev.zacsweers.metro.SingleIn
import io.ktor.client.HttpClient
import io.ktor.client.plugins.websocket.converter
import io.ktor.client.plugins.websocket.webSocketSession
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.request.url
import io.ktor.util.reflect.typeInfo
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.consumeAsFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch

@SingleIn(AppScope::class)
@Inject
class AccordClient(
    private val httpClient: HttpClient,
    private val scope: CoroutineScope
) {
    private val baseURL = "http://localhost:3000"

    suspend fun createMat(name: String, judgeCount: Int) {
        val url = "$baseURL/mat"
        httpClient.post(url) {
            setBody(CreateMatRequest(name, judgeCount))
        }
    }

    fun observeMatStatus(/*TODO*/) {
        scope.launch(Dispatchers.IO) {
            val session = httpClient.webSocketSession {
                url("ws://localhost:8080/ws")
            }
            val converter = checkNotNull(session.converter)
            session.incoming
                .consumeAsFlow()
                .map {
                    converter.deserialize(
                        charset = Charsets.UTF_8,
                        typeInfo = typeInfo<ReceiveInfo>(),
                        content = it
                    )
                }

        }
    }
}

sealed interface ReceiveInfo {

}