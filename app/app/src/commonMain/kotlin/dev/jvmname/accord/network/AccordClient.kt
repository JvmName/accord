package dev.jvmname.accord.network

import com.github.michaelbull.result.map
import dev.jvmname.accord.ui.catchRunning
import dev.zacsweers.metro.AppScope
import dev.zacsweers.metro.Inject
import dev.zacsweers.metro.SingleIn
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.delete
import io.ktor.client.request.get
import io.ktor.client.request.parameter
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext


@SingleIn(AppScope::class)
@Inject
class AccordClient(private val httpClient: HttpClient) {

    // ========================================================================
    // Authentication
    // ========================================================================

    suspend fun createUser(name: String): NetworkResult<CreateUserResponse> {
        return withContext(Dispatchers.IO) {
            catchRunning {
                httpClient.post("users") {
                    setBody(CreateUserRequest(name))
                }.body<ApiResult<CreateUserResponseData>>()
            }
                .unwrapApiResult()
                .map { it.data }
        }
    }

    // ========================================================================
    // Mats
    // ========================================================================

    suspend fun createMat(name: String, judgeCount: Int): NetworkResult<Mat> {
        return withContext(Dispatchers.IO) {
            catchRunning {
                httpClient.post("mats") {
                    setBody(CreateMatRequest(name, judgeCount))
                }.body<ApiResult<MatResponseData>>()
            }
                .unwrapApiResult()
                .map { it.mat }
        }
    }

    suspend fun getMat(matId: String): NetworkResult<Mat> {
        return withContext(Dispatchers.IO) {
            catchRunning {
                httpClient.get("mat/$matId")
                    .body<ApiResult<MatResponseData>>()
            }
                .unwrapApiResult()
                .map { it.mat }
        }
    }

    suspend fun joinMat(matCode: String, name: String): NetworkResult<JoinMatResult> {
        return withContext(Dispatchers.IO) {
            catchRunning {
                httpClient.post("mat/$matCode/join") {
                    setBody(JoinMatRequest(name))
                }.body<ApiResult<JoinMatResponseData>>()
            }
                .unwrapApiResult()
                .map { it.data }
        }
    }

    suspend fun leaveMat(matCode: String): NetworkResult<Mat> {
        return withContext(Dispatchers.IO) {
            catchRunning {
                httpClient.delete("mat/$matCode/join")
                    .body<ApiResult<MatResponseData>>()
            }
                .unwrapApiResult()
                .map { it.mat }
        }
    }

    suspend fun listJudges(matCode: String): NetworkResult<List<User>> {
        return withContext(Dispatchers.IO) {
            catchRunning {
                httpClient.get("mat/$matCode/judges")
                    .body<ApiResult<JudgesResponseData>>()
            }
                .unwrapApiResult()
                .map { it.judges }
        }
    }

    suspend fun listViewers(matCode: String): NetworkResult<List<User>> {
        return withContext(Dispatchers.IO) {
            catchRunning {
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
        return withContext(Dispatchers.IO) {
            catchRunning {
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
        }
    }

    suspend fun getMatch(matchId: MatchId): NetworkResult<Match> {
        return withContext(Dispatchers.IO) {
            catchRunning {
                httpClient.get("match/${matchId.id}")
                    .body<ApiResult<MatchResponseData>>()
            }
                .unwrapApiResult()
                .map { it.match }
        }
    }

    suspend fun startMatch(matchId: MatchId): NetworkResult<Match> {
        return withContext(Dispatchers.IO) {
            catchRunning {
                httpClient.post("match/${matchId.id}/start")
                    .body<ApiResult<MatchResponseData>>()
            }
                .unwrapApiResult()
                .map { it.match }
        }
    }

    suspend fun endMatch(
        matchId: MatchId,
        submission: String? = null,
        submitter: CompetitorColor? = null,
    ): NetworkResult<Match> {
        return withContext(Dispatchers.IO) {
            catchRunning {
                httpClient.post("match/${matchId.id}/end") {
                    setBody(EndMatchRequest(submission, submitter))
                }.body<ApiResult<MatchResponseData>>()
            }
                .unwrapApiResult()
                .map { it.match }
        }
    }

    // ========================================================================
    // Rounds
    // ========================================================================

    suspend fun startRound(matchId: MatchId): NetworkResult<Match> {
        return withContext(Dispatchers.IO) {
            catchRunning {
                httpClient.post("match/${matchId.id}/rounds")
                    .body<ApiResult<MatchResponseData>>()
            }
                .unwrapApiResult()
                .map { it.match }
        }
    }

    suspend fun endRound(
        matchId: MatchId,
        submission: String? = null,
        submitter: CompetitorColor? = null
    ): NetworkResult<Match> {
        return withContext(Dispatchers.IO) {
            catchRunning {
                httpClient.post("match/${matchId.id}/rounds/end") {
                    setBody(EndRoundRequest(submission, submitter))
                }.body<ApiResult<MatchResponseData>>()
            }
                .unwrapApiResult()
                .map { it.match }
        }
    }

    suspend fun pauseRound(matchId: MatchId): NetworkResult<Match> {
        return withContext(Dispatchers.IO) {
            catchRunning {
                httpClient.post("match/${matchId.id}/rounds/pause")
                    .body<ApiResult<MatchResponseData>>()
            }.unwrapApiResult().map { it.match }
        }
    }

    suspend fun resumeRound(matchId: MatchId): NetworkResult<Match> {
        return withContext(Dispatchers.IO) {
            catchRunning {
                httpClient.post("match/${matchId.id}/rounds/resume")
                    .body<ApiResult<MatchResponseData>>()
            }.unwrapApiResult().map { it.match }
        }
    }

    // ========================================================================
    // Riding Time Votes
    // ========================================================================

    suspend fun startRidingTimeVote(
        matchId: MatchId,
        rider: CompetitorColor
    ): NetworkResult<Match> {
        return withContext(Dispatchers.IO) {
            catchRunning {
                httpClient.post("match/${matchId.id}/ridingTime") {
                    setBody(StartRidingTimeVoteRequest(rider))
                }.body<ApiResult<MatchResponseData>>()
            }
                .unwrapApiResult()
                .map { it.match }
        }
    }

    suspend fun endRidingTimeVote(matchId: MatchId, rider: CompetitorColor): NetworkResult<Match> {
        return withContext(Dispatchers.IO) {
            catchRunning {
                httpClient.delete("match/${matchId.id}/ridingTime") {
                    parameter("rider", rider.name.lowercase())
                }.body<ApiResult<MatchResponseData>>()
            }
                .unwrapApiResult()
                .map { it.match }
        }
    }
}