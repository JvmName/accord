package dev.jvmname.accord.domain

import com.github.michaelbull.result.onSuccess
import dev.jvmname.accord.network.AccordClient
import dev.jvmname.accord.network.Mat
import dev.jvmname.accord.network.NetworkResult
import dev.jvmname.accord.prefs.Prefs
import dev.zacsweers.metro.Inject

@Inject
class MatManager(
    private val prefs: Prefs,
    private val client: AccordClient,
) {

    suspend fun createMat(name: String, judgeCount: Int): NetworkResult<Mat> {
        return client.createMat(name, judgeCount)
            .onSuccess {
                prefs.updateMatInfo(it)
            }
    }
}