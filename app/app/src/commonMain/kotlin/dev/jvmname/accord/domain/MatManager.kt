package dev.jvmname.accord.domain

import com.github.michaelbull.result.coroutines.coroutineBinding
import com.github.michaelbull.result.onOk
import dev.jvmname.accord.domain.user.UserManager
import dev.jvmname.accord.network.AccordClient
import dev.jvmname.accord.network.CompetitorRequest
import dev.jvmname.accord.network.Mat
import dev.jvmname.accord.network.MatId
import dev.jvmname.accord.network.Match
import dev.jvmname.accord.network.NetworkResult
import dev.jvmname.accord.network.User
import dev.jvmname.accord.network.adminCode
import dev.jvmname.accord.network.merge
import dev.jvmname.accord.prefs.Prefs
import dev.zacsweers.metro.Inject
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first

@Inject
class MatManager(
    private val prefs: Prefs,
    private val client: AccordClient,
    private val userManager: UserManager,
) {

    suspend fun createMatAndMatch(
        masterName: String,
        matName: String,
        judgeCount: Int,
        redName: String,
        blueName: String,
    ): NetworkResult<Pair<Mat, Match>> = coroutineBinding {
        val user = when {
            // TODO("consider re-using existing user identity vs always creating new")
            userManager.hasUser() -> userManager.user()
            else -> userManager.createUser(masterName).bind()
        }
        val mat = client.createMat(matName, judgeCount).bind()
        val match = client.createMatch(
            matCode = mat.adminCode.code,
            redCompetitor = CompetitorRequest(name = redName),
            blueCompetitor = CompetitorRequest(name = blueName),
        ).bind()
        prefs.updateMatInfo(mat)
        prefs.updateCurrentMatch(match)
        mat to match
    }

    suspend fun createMatch(
        redName: String,
        blueName: String,
    ): NetworkResult<Match> {
        val mat = prefs.observeMatInfo().first()!! //TODO
//            ?: return Err(IllegalStateException("No active mat"))
        return client.createMatch(
                matCode = mat.adminCode.code,
                redCompetitor = CompetitorRequest(name = redName),
                blueCompetitor = CompetitorRequest(name = blueName),
            ).onOk { match ->
            prefs.updateCurrentMatch(match)
        }
    }

    /**
     * Join a mat as judge or viewer (determined by mat code role).
     * Updates cached mat info in Prefs.
     */
    suspend fun joinMat(matCode: String, userName: String): NetworkResult<Mat> {
        return coroutineBinding {
            val result = client.joinMat(matCode, userName).bind()
            // The join endpoint returns a partial mat (no codes) — merge with what we have
            // stored so callers that need codes (e.g. createMatch, ShowCodesScreen) work.
            val mat = prefs.observeMatInfo()
                .first()
                ?.let { result.mat.merge(it) }
                ?: result.mat
            prefs.updateMainUser(result.user)
            prefs.setAuthToken(result.authToken)

            // Fetch full mat to include current_match, then merge to preserve codes
            val fullMat = getMat(mat.id).bind().merge(mat)
            prefs.updateMatInfo(fullMat)
            fullMat
        }
    }

    suspend fun getMat(matId: MatId): NetworkResult<Mat> {
        return client.getMat(matId.id)
            .onOk { prefs.updateMatInfo(it) }
    }

    /** Observe mat info changes from Prefs. */
    fun observeMatInfo(): Flow<Mat?> = prefs.observeMatInfo()

    /**
     * Leave a mat (remove as judge or viewer).
     * Updates cached mat info in Prefs.
     */
    suspend fun leaveMat(matCode: String): NetworkResult<Mat> {
        return client.leaveMat(matCode)
            .onOk {
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