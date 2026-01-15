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


typealias NetworkResult<T> = Result<T, ApiError>

@SingleIn(AppScope::class)
@Inject
class AccordClient(private val httpClient: HttpClient) {

    // ========================================================================
    // Authentication
    // ========================================================================

    suspend fun createUser(name: String, email: String): NetworkResult<CreateUserResponse> {
        return withContext(Dispatchers.IO) {
            catchRunning {
                httpClient.post("users") {
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

    suspend fun joinMat(matCode: String): NetworkResult<Mat> {
        return withContext(Dispatchers.IO) {
            catchRunning {
                httpClient.post("mat/$matCode/join")
                    .body<ApiResult<MatResponseData>>()
            }
                .unwrapApiResult()
                .map { it.mat }
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
        redCompetitorId: UserId,
        blueCompetitorId: UserId
    ): NetworkResult<Match> {
        return withContext(Dispatchers.IO) {
            catchRunning {
                httpClient.post("mat/$matCode/matches") {
                    contentType(ContentType.Application.Json)
                    setBody(CreateMatchRequest(redCompetitorId, blueCompetitorId))
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
        submitter: CompetitorColor? = null
    ): NetworkResult<Match> {
        return withContext(Dispatchers.IO) {
            catchRunning {
                httpClient.post("match/${matchId.id}/end") {
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

    suspend fun startRidingTimeVote(
        matchId: MatchId,
        rider: CompetitorColor
    ): NetworkResult<Match> {
        return withContext(Dispatchers.IO) {
            catchRunning {
                httpClient.post("match/${matchId.id}/ridingTime") {
                    contentType(ContentType.Application.Json)
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
                    contentType(ContentType.Application.Json)
                    setBody(EndRidingTimeVoteRequest(rider))
                }.body<ApiResult<MatchResponseData>>()
            }
                .unwrapApiResult()
                .map { it.match }
        }
    }
}