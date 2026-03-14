package dev.jvmname.accord.domain

import com.github.michaelbull.result.coroutines.coroutineBinding
import com.github.michaelbull.result.map
import com.github.michaelbull.result.onSuccess
import dev.jvmname.accord.domain.user.UserManager
import dev.jvmname.accord.network.AccordClient
import dev.jvmname.accord.network.CompetitorRequest
import dev.jvmname.accord.network.Mat
import dev.jvmname.accord.network.Match
import dev.jvmname.accord.network.NetworkResult
import dev.jvmname.accord.network.User
import dev.jvmname.accord.network.adminCode
import dev.jvmname.accord.prefs.Prefs
import dev.zacsweers.metro.Inject
import kotlinx.coroutines.flow.Flow

@Inject
class MatManager(
    private val prefs: Prefs,
    private val client: AccordClient,
    private val userManager: UserManager,
) {

    suspend fun createMatAndMatch(
        name: String,
        judgeCount: Int,
        redName: String,
        blueName: String,
    ): NetworkResult<Pair<Mat, Match>> {
        return coroutineBinding {
            val user = when {
                userManager.hasUser() -> userManager.user()
                else -> userManager.createUser(name).bind()
            }
            val mat = client.createMat(name, judgeCount).bind()
            val match = client.createMatch(
                matCode = mat.adminCode.code,
                redCompetitor = CompetitorRequest(name = redName),
                blueCompetitor = CompetitorRequest(name = blueName),
            ).bind()
            prefs.updateMatInfo(mat)
            prefs.updateCurrentMatch(match)
            mat to match
        }
    }

    /**
     * Join a mat as judge or viewer (determined by mat code role).
     * Updates cached mat info in Prefs.
     */
    suspend fun joinMat(matCode: String, userName: String): NetworkResult<Mat> {
        return client.joinMat(matCode, userName)
            .onSuccess {
                prefs.updateMatInfo(it.mat)
                prefs.updateMainUser(it.user)
                prefs.setAuthToken(it.authToken)
            }
            .map { it.mat }
    }

    suspend fun getMat(matId: String): NetworkResult<Mat> {
        return client.getMat(matId)
            .onSuccess { prefs.updateMatInfo(it) }
    }

    /** Observe mat info changes from Prefs. */
    fun observeMatInfo(): Flow<Mat?> = prefs.observeMatInfo()

    /**
     * Leave a mat (remove as judge or viewer).
     * Updates cached mat info in Prefs.
     */
    suspend fun leaveMat(matCode: String): NetworkResult<Mat> {
        return client.leaveMat(matCode)
            .onSuccess {
                prefs.updateMatInfo(it)
            }
    }

    /**
     * Get list of judges for a mat.
     */
    suspend fun listJudges(matCode: String): NetworkResult<List<User>> {
        return client.listJudges(matCode)
    }

    /**
     * Get list of viewers for a mat.
     */
    suspend fun listViewers(matCode: String): NetworkResult<List<User>> {
        return client.listViewers(matCode)
    }
}