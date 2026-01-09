package dev.jvmname.accord.network

import dev.drewhamilton.poko.Poko
import dev.jvmname.accord.parcel.CommonParcelable
import dev.jvmname.accord.parcel.CommonParcelize
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@[Serializable(with = ApiResultSerializer::class)]
sealed interface ApiResult<out T> {
    @JvmInline
    value class Success<T>(val data: T) : ApiResult<T>

    data class Error<T>(val errors: Map<String, List<String>>) : ApiResult<T>
}


// ============================================================================
// ID Value Classes
// ============================================================================

@[JvmInline Serializable CommonParcelize]
value class UserId(val id: String) : CommonParcelable

@[JvmInline Serializable CommonParcelize]
value class MatId(val id: String) : CommonParcelable

@[JvmInline Serializable CommonParcelize]
value class MatchId(val id: String) : CommonParcelable

@[JvmInline Serializable CommonParcelize]
value class RoundId(val id: String) : CommonParcelable

// ============================================================================
// User Models
// ============================================================================

@[Poko Serializable CommonParcelize]
class User(
    val id: UserId,
    val name: String,
    val email: String,
) : CommonParcelable

@[Poko Serializable]
class CreateUserRequest(
    val name: String,
    val email: String,
)

@[Poko Serializable]
class CreateUserResponse(
    val user: User,
    @SerialName("api_token")
    val apiToken: String,
)

// ============================================================================
// Mat Models
// ============================================================================

@[Poko Serializable CommonParcelize]
class MatCode(
    val code: String,
    val role: Role,
) : CommonParcelable

enum class Role {
    @SerialName("admin")
    ADMIN,

    @SerialName("viewer")
    VIEWER,
}

@[Poko Serializable CommonParcelize]
class Mat(
    val id: MatId,
    val name: String,
    @SerialName("judge_count")
    val judgeCount: Int,
    @SerialName("creator_id")
    val creatorId: UserId,
    val judges: List<User> = emptyList(),
    val codes: List<MatCode> = emptyList(),
    @SerialName("current_match")
    val currentMatch: Match? = null,
    @SerialName("upcoming_matches")
    val upcomingMatches: List<Match> = emptyList(),
) : CommonParcelable

@[Poko Serializable]
class CreateMatRequest(
    val name: String,
    @SerialName("judge_count")
    val judgeCount: Int,
)

// ============================================================================
// Match Models
// ============================================================================

@[Poko Serializable CommonParcelize]
class Match(
    val id: MatchId,
    @SerialName("creator_id")
    val creatorId: UserId,
    @SerialName("mat_id")
    val matId: MatId,
    @SerialName("started_at")
    val startedAt: Long?,
    @SerialName("ended_at")
    val endedAt: Long?,
    @SerialName("red_competitor")
    val redCompetitor: User,
    @SerialName("blue_competitor")
    val blueCompetitor: User,
    val mat: Mat? = null,
    val judges: List<User> = emptyList(),
    val rounds: List<Round> = emptyList(),
) : CommonParcelable

@[Poko Serializable]
class CreateMatchRequest(
    @SerialName("red_competitor_id")
    val redCompetitorId: UserId,
    @SerialName("blue_competitor_id")
    val blueCompetitorId: UserId,
)

//TODO this is wrong
@[Poko Serializable]
class EndMatchRequest(
    val submission: String? = null,
    val submitter: CompetitorColor? = null,
)

enum class CompetitorColor {
    @SerialName("red")
    RED,

    @SerialName("blue")
    BLUE,
}

// ============================================================================
// Round Models
// ============================================================================

@[Poko Serializable CommonParcelize]
class Round(
    val id: RoundId,
    @SerialName("started_at")
    val startedAt: Long,
    @SerialName("ended_at")
    val endedAt: Long?,
    @SerialName("ridingTime")
    val ridingTime: Map<UserId, Double>,
    val result: RoundResult,
) : CommonParcelable

@[Poko Serializable CommonParcelize]
class RoundResult(
    val winner: User?,
    val method: RoundResultMethod,
) : CommonParcelable

@[Poko Serializable CommonParcelize]
class RoundResultMethod(
    val type: RoundResultType?,
    val value: String?, // Can be submission name (string), riding time (number as string), or null
) : CommonParcelable

enum class RoundResultType {
    @SerialName("submission")
    SUBMISSION,

    @SerialName("riding_time")
    RIDING_TIME,

    @SerialName("tie")
    TIE,
}

@[Poko Serializable]
class EndRoundRequest(
    val submission: String? = null,
    val submitter: CompetitorColor? = null,
)

// ============================================================================
// Riding Time Vote Models
// ============================================================================

@[Poko Serializable]
class StartRidingTimeVoteRequest(
    val rider: CompetitorColor,
)

@[Poko Serializable]
class EndRidingTimeVoteRequest(
    val rider: CompetitorColor,
)

// ============================================================================
// Response Wrappers
// ============================================================================

@[JvmInline Serializable]
value class CreateUserResponseData(val data: CreateUserResponse)

@[JvmInline Serializable]
value class MatResponseData(val mat: Mat)

@[JvmInline Serializable]
value class MatchResponseData(val match: Match)

@[JvmInline Serializable]
value class JudgesResponseData(val judges: List<User>)

@[JvmInline Serializable]
value class ViewersResponseData(val viewers: List<User>)