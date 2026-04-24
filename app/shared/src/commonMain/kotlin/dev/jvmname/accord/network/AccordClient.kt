package dev.jvmname.accord.network

import co.touchlab.kermit.Logger
import com.github.michaelbull.result.coroutines.runSuspendCatching
import com.github.michaelbull.result.map
import com.github.michaelbull.result.onErr
import com.github.michaelbull.result.onOk
import dev.jvmname.accord.common.Dispatchers
import dev.zacsweers.metro.AppScope
import dev.zacsweers.metro.Inject
import dev.zacsweers.metro.SingleIn
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.delete
import io.ktor.client.request.get
import io.ktor.client.request.parameter
import io.ktor.client.request.patch
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import kotlinx.coroutines.withContext


@SingleIn(AppScope::class)
@Inject
class AccordClient(private val httpClient: HttpClient) {

    private val log = Logger.withTag("Net/AccordClient")

    // ========================================================================
    // Authentication
    // ========================================================================

    suspend fun createUser(name: String): NetworkResult<CreateUserResponse> {
        log.d { "createUser name=$name" }
        return withContext(Dispatchers.IO) {
            runSuspendCatching {
                httpClient.post("users") {
                    setBody(CreateUserRequest(name))
                }.body<ApiResult<CreateUserResponseData>>()
            }
                .unwrapApiResult()
                .map { it.data }
                .onOk { log.i { "user created id=${it.user.id}" } }
                .onErr { log.w { "createUser FAILED: $it" } }
        }
    }

    // ========================================================================
    // Mats
    // ========================================================================

    suspend fun createMat(name: String, judgeCount: Int): NetworkResult<Mat> {
        log.d { "createMat name=$name judges=$judgeCount" }
        return withContext(Dispatchers.IO) {
            runSuspendCatching {
                httpClient.post("mats") {
                    setBody(CreateMatRequest(name, judgeCount))
                }.body<ApiResult<MatResponseData>>()
            }
                .unwrapApiResult()
                .map { it.mat }
                .onOk { log.i { "mat created id=${it.id}" } }
                .onErr { log.w { "createMat FAILED: $it" } }
        }
    }

    suspend fun getMat(matId: String): NetworkResult<Mat> {
        log.d { "getMat matId=$matId" }
        return withContext(Dispatchers.IO) {
            runSuspendCatching {
                httpClient.get("mat/$matId")
                    .body<ApiResult<MatResponseData>>()
            }
                .unwrapApiResult()
                .map { it.mat }
                .onOk { log.i { "getMat OK id=${it.id}" } }
                .onErr { log.w { "getMat FAILED: $it" } }
        }
    }

    suspend fun joinMat(matCode: String, name: String): NetworkResult<JoinMatResult> {
        log.d { "joinMat code=${matCode.split('.').first()}..." }
        return withContext(Dispatchers.IO) {
            runSuspendCatching {
                httpClient.post("mat/$matCode/join") {
                    setBody(JoinMatRequest(name))
                }.body<ApiResult<JoinMatResponseData>>()
            }
                .unwrapApiResult()
                .map { it.data }
                .onOk { log.i { "joined mat=${it.mat.id}" } }
                .onErr { log.w { "joinMat FAILED: $it" } }
        }
    }

    suspend fun leaveMat(matCode: String): NetworkResult<Mat> {
        log.d { "leaveMat matCode=${matCode.split('.').first()}..." }
        return withContext(Dispatchers.IO) {
            runSuspendCatching {
                httpClient.delete("mat/$matCode/join")
                    .body<ApiResult<MatResponseData>>()
            }
                .unwrapApiResult()
                .map { it.mat }
                .onOk { log.i { "leaveMat OK id=${it.id}" } }
                .onErr { log.w { "leaveMat FAILED: $it" } }
        }
    }

    suspend fun listJudges(matCode: String): NetworkResult<List<User>> {
        return withContext(Dispatchers.IO) {
            runSuspendCatching {
                httpClient.get("mat/$matCode/judges")
                    .body<ApiResult<JudgesResponseData>>()
            }
                .unwrapApiResult()
                .map { it.judges }
        }
    }

    suspend fun listViewers(matCode: String): NetworkResult<List<User>> {
        return withContext(Dispatchers.IO) {
            runSuspendCatching {
                httpClient.get("mat/$matCode/viewers")
                    .body<ApiResult<ViewersResponseData>>()
            }
                .unwrapApiResult()
                .map { it.viewers }
        }
    }

    // ========================================================================
    // Matches
    // ========================================================================

    suspend fun createMatch(
        matCode: String,
        redCompetitor: CompetitorRequest,
        blueCompetitor: CompetitorRequest,
    ): NetworkResult<Match> {
        log.d { "createMatch matCode=${matCode.split('.').first()}..." }
        return withContext(Dispatchers.IO) {
            runSuspendCatching {
                httpClient.post("mat/$matCode/matches") {
                    setBody(
                        CreateMatchRequest(
                            red = redCompetitor,
                            blue = blueCompetitor,
                        )
                    )
                }.body<ApiResult<MatchResponseData>>()
            }
                .unwrapApiResult()
                .map { it.match }
                .onOk { log.i { "match created id=${it.id}" } }
                .onErr { log.w { "createMatch FAILED: $it" } }
        }
    }

    suspend fun getMatch(matchId: MatchId): NetworkResult<Match> {
        log.d { "getMatch matchId=$matchId" }
        return withContext(Dispatchers.IO) {
            runSuspendCatching {
                httpClient.get("match/${matchId.id}")
                    .body<ApiResult<MatchResponseData>>()
            }
                .unwrapApiResult()
                .map { it.match }
                .onOk { log.i { "getMatch OK id=${it.id}" } }
                .onErr { log.w { "getMatch FAILED: $it" } }
        }
    }

    suspend fun startMatch(matchId: MatchId): NetworkResult<Match> {
        log.d { "startMatch matchId=$matchId" }
        return withContext(Dispatchers.IO) {
            runSuspendCatching {
                httpClient.post("match/${matchId.id}/start")
                    .body<ApiResult<MatchResponseData>>()
            }
                .unwrapApiResult()
                .map { it.match }
                .onOk { log.i { "startMatch OK id=${it.id}" } }
                .onErr { log.w { "startMatch FAILED: $it" } }
        }
    }

    suspend fun endMatch(
        matchId: MatchId,
    ): NetworkResult<Match> {
        log.d { "endMatch matchId=$matchId " }
        return withContext(Dispatchers.IO) {
            runSuspendCatching {
                httpClient.post("match/${matchId.id}/end")
                    .body<ApiResult<MatchResponseData>>()
            }
                .unwrapApiResult()
                .map { it.match }
                .onOk { log.i { "endMatch OK id=${it.id}" } }
                .onErr { log.w { "endMatch FAILED: $it" } }
        }
    }

    // ========================================================================
    // Rounds
    // ========================================================================

    suspend fun startRound(matchId: MatchId): NetworkResult<Match> {
        log.d { "startRound matchId=$matchId" }
        return withContext(Dispatchers.IO) {
            runSuspendCatching {
                httpClient.post("match/${matchId.id}/rounds")
                    .body<ApiResult<MatchResponseData>>()
            }
                .unwrapApiResult()
                .map { it.match }
                .onOk { log.i { "startRound OK matchId=${it.id} rounds=${it.rounds.size}" } }
                .onErr { log.w { "startRound FAILED: $it" } }
        }
    }

    suspend fun endRound(matchId: MatchId): NetworkResult<Match> {
        log.d { "endRound matchId=$matchId" }
        return withContext(Dispatchers.IO) {
            runSuspendCatching {
                httpClient.post("match/${matchId.id}/rounds/end")
                    .body<ApiResult<MatchResponseData>>()
            }
                .unwrapApiResult()
                .map { it.match }
                .onOk { log.i { "endRound OK matchId=${it.id}" } }
                .onErr { log.w { "endRound FAILED: $it" } }
        }
    }

    suspend fun patchRoundResult(
        matchId: MatchId,
        winner: CompetitorColor?,
        stoppage: Boolean,
    ): NetworkResult<Match> {
        log.d { "patchRoundResult matchId=$matchId winner=$winner stoppage=$stoppage" }
        return withContext(Dispatchers.IO) {
            runSuspendCatching {
                httpClient.patch("match/${matchId.id}/rounds/result") {
                    setBody(EndRoundRequest(winner = winner, stoppage = stoppage))
                }.body<ApiResult<MatchResponseData>>()
            }
                .unwrapApiResult()
                .map { it.match }
                .onOk { log.i { "patchRoundResult OK matchId=${it.id}" } }
                .onErr { log.w { "patchRoundResult FAILED: $it" } }
        }
    }

    suspend fun pauseRound(matchId: MatchId): NetworkResult<Match> {
        log.d { "pauseRound matchId=$matchId" }
        return withContext(Dispatchers.IO) {
            runSuspendCatching {
                httpClient.post("match/${matchId.id}/rounds/pause")
                    .body<ApiResult<MatchResponseData>>()
            }.unwrapApiResult().map { it.match }
                .onOk { log.i { "pauseRound OK matchId=${it.id}" } }
                .onErr { log.w { "pauseRound FAILED: $it" } }
        }
    }

    suspend fun resumeRound(matchId: MatchId): NetworkResult<Match> {
        log.d { "resumeRound matchId=$matchId" }
        return withContext(Dispatchers.IO) {
            runSuspendCatching {
                httpClient.post("match/${matchId.id}/rounds/resume")
                    .body<ApiResult<MatchResponseData>>()
            }.unwrapApiResult().map { it.match }
                .onOk { log.i { "resumeRound OK matchId=${it.id}" } }
                .onErr { log.w { "resumeRound FAILED: $it" } }
        }
    }

    // ========================================================================
    // Riding Time Votes
    // ========================================================================

    suspend fun startRidingTimeVote(
        matchId: MatchId,
        rider: CompetitorColor
    ): NetworkResult<Match> {
        log.d { "startRidingTimeVote matchId=$matchId rider=$rider" }
        return withContext(Dispatchers.IO) {
            runSuspendCatching {
                httpClient.post("match/${matchId.id}/ridingTime") {
                    setBody(StartRidingTimeVoteRequest(rider))
                }.body<ApiResult<MatchResponseData>>()
            }
                .unwrapApiResult()
                .map { it.match }
                .onOk { log.d { "startRidingTimeVote OK matchId=${it.id}" } }
                .onErr { log.w { "startRidingTimeVote FAILED: $it" } }
        }
    }

    suspend fun endRidingTimeVote(matchId: MatchId, rider: CompetitorColor): NetworkResult<Match> {
        log.d { "endRidingTimeVote matchId=$matchId rider=$rider" }
        return withContext(Dispatchers.IO) {
            runSuspendCatching {
                httpClient.delete("match/${matchId.id}/ridingTime") {
                    parameter("rider", rider.name.lowercase())
                }.body<ApiResult<MatchResponseData>>()
            }
                .unwrapApiResult()
                .map { it.match }
                .onOk { log.d { "endRidingTimeVote OK matchId=${it.id}" } }
                .onErr { log.w { "endRidingTimeVote FAILED: $it" } }
        }
    }
}