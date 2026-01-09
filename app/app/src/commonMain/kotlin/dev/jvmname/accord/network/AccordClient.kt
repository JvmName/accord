package dev.jvmname.accord.network

import com.github.michaelbull.result.Result
import com.github.michaelbull.result.map
import dev.jvmname.accord.ui.catchRunning
import dev.zacsweers.metro.AppScope
import dev.zacsweers.metro.Inject
import dev.zacsweers.metro.SingleIn
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.delete
import io.ktor.client.request.get
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.http.ContentType
import io.ktor.http.contentType
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

@SingleIn(AppScope::class)
@Inject
class AccordClient(
    private val httpClient: HttpClient,
) {
    private val baseURL = "http://localhost:3000"

    // ========================================================================
    // Authentication
    // ========================================================================

    suspend fun createUser(name: String, email: String): Result<CreateUserResponse, ApiError> {
        return withContext(Dispatchers.IO) {
            catchRunning {
                httpClient.post("$baseURL/users") {
                    contentType(ContentType.Application.Json)
                    setBody(CreateUserRequest(name, email))
                }.body<ApiResult<CreateUserResponseData>>()
            }
                .unwrapApiResult()
                .map { it.data }
        }
    }

    // ========================================================================
    // Mats
    // ========================================================================

    suspend fun createMat(name: String, judgeCount: Int): Result<Mat, ApiError> {
        return withContext(Dispatchers.IO) {
            catchRunning {
                httpClient.post("$baseURL/mats") {
                    contentType(ContentType.Application.Json)
                    setBody(CreateMatRequest(name, judgeCount))
                }.body<ApiResult<MatResponseData>>()
            }
                .unwrapApiResult()
                .map { it.mat }
        }
    }

    suspend fun getMat(matId: String): Result<Mat, ApiError> {
        return withContext(Dispatchers.IO) {
            catchRunning {
                httpClient.get("$baseURL/mat/$matId")
                    .body<ApiResult<MatResponseData>>()
            }
                .unwrapApiResult()
                .map { it.mat }
        }
    }

    suspend fun joinMat(matCode: String): Result<Mat, ApiError> {
        return withContext(Dispatchers.IO) {
            catchRunning {
                httpClient.post("$baseURL/mat/$matCode/join")
                    .body<ApiResult<MatResponseData>>()
            }
                .unwrapApiResult()
                .map { it.mat }
        }
    }

    suspend fun leaveMat(matCode: String): Result<Mat, ApiError> {
        return withContext(Dispatchers.IO) {
            catchRunning {
                httpClient.delete("$baseURL/mat/$matCode/join")
                    .body<ApiResult<MatResponseData>>()
            }
                .unwrapApiResult()
                .map { it.mat }
        }
    }

    suspend fun listJudges(matCode: String): Result<List<User>, ApiError> {
        return withContext(Dispatchers.IO) {
            catchRunning {
                httpClient.get("$baseURL/mat/$matCode/judges")
                    .body<ApiResult<JudgesResponseData>>()
            }
                .unwrapApiResult()
                .map { it.judges }
        }
    }

    suspend fun listViewers(matCode: String): Result<List<User>, ApiError> {
        return withContext(Dispatchers.IO) {
            catchRunning {
                httpClient.get("$baseURL/mat/$matCode/viewers")
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
        redCompetitorId: UserId,
        blueCompetitorId: UserId
    ): Result<Match, ApiError> {
        return withContext(Dispatchers.IO) {
            catchRunning {
                httpClient.post("$baseURL/mat/$matCode/matches") {
                    contentType(ContentType.Application.Json)
                    setBody(CreateMatchRequest(redCompetitorId, blueCompetitorId))
                }.body<ApiResult<MatchResponseData>>()
            }
                .unwrapApiResult()
                .map { it.match }
        }
    }

    suspend fun getMatch(matchId: MatchId): Result<Match, ApiError> {
        return withContext(Dispatchers.IO) {
            catchRunning {
                httpClient.get("$baseURL/match/${matchId.id}")
                    .body<ApiResult<MatchResponseData>>()
            }
                .unwrapApiResult()
                .map { it.match }
        }
    }

    suspend fun startMatch(matchId: MatchId): Result<Match, ApiError> {
        return withContext(Dispatchers.IO) {
            catchRunning {
                httpClient.post("$baseURL/match/${matchId.id}/start")
                    .body<ApiResult<MatchResponseData>>()
            }
                .unwrapApiResult()
                .map { it.match }
        }
    }

    suspend fun endMatch(
        matchId: MatchId,
        submission: String? = null,
        submitter: CompetitorColor? = null
    ): Result<Match, ApiError> {
        return withContext(Dispatchers.IO) {
            catchRunning {
                httpClient.post("$baseURL/match/${matchId.id}/end") {
                    contentType(ContentType.Application.Json)
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

    suspend fun startRound(matchId: MatchId): Result<Match, ApiError> {
        return withContext(Dispatchers.IO) {
            catchRunning {
                httpClient.post("$baseURL/match/${matchId.id}/rounds")
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
    ): Result<Match, ApiError> {
        return withContext(Dispatchers.IO) {
            catchRunning {
                httpClient.post("$baseURL/match/${matchId.id}/rounds/end") {
                    contentType(ContentType.Application.Json)
                    setBody(EndRoundRequest(submission, submitter))
                }.body<ApiResult<MatchResponseData>>()
            }
                .unwrapApiResult()
                .map { it.match }
        }
    }

    // ========================================================================
    // Riding Time Votes
    // ========================================================================

    suspend fun startRidingTimeVote(matchId: MatchId, rider: CompetitorColor): Result<Match, ApiError> {
        return withContext(Dispatchers.IO) {
            catchRunning {
                httpClient.post("$baseURL/match/${matchId.id}/ridingTime") {
                    contentType(ContentType.Application.Json)
                    setBody(StartRidingTimeVoteRequest(rider))
                }.body<ApiResult<MatchResponseData>>()
            }
                .unwrapApiResult()
                .map { it.match }
        }
    }

    suspend fun endRidingTimeVote(matchId: MatchId, rider: CompetitorColor): Result<Match, ApiError> {
        return withContext(Dispatchers.IO) {
            catchRunning {
                httpClient.delete("$baseURL/match/${matchId.id}/ridingTime") {
                    contentType(ContentType.Application.Json)
                    setBody(EndRidingTimeVoteRequest(rider))
                }.body<ApiResult<MatchResponseData>>()
            }
                .unwrapApiResult()
                .map { it.match }
        }
    }
}