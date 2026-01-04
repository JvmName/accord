package dev.jvmname.accord.domain

import com.github.michaelbull.result.Result
import com.github.michaelbull.result.onSuccess
import dev.jvmname.accord.network.AccordClient
import dev.jvmname.accord.network.model.MatInfo
import dev.jvmname.accord.prefs.Prefs
import dev.zacsweers.metro.Inject

@Inject
class MatCreator(
    private val prefs: Prefs,
    private val client: AccordClient,
) {

    suspend fun createMat(name: String, judgeCount: Int): Result<MatInfo, Throwable> {
        return client.createMat(name, judgeCount)
            .onSuccess {
                prefs.updateMatInfo(it)
            }
    }
}