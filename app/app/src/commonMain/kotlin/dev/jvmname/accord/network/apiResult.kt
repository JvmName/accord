package dev.jvmname.accord.network

import co.touchlab.kermit.Logger
import com.github.michaelbull.result.Err
import com.github.michaelbull.result.Ok
import com.github.michaelbull.result.Result
import com.github.michaelbull.result.andThen
import com.github.michaelbull.result.annotation.UnsafeResultValueAccess
import com.github.michaelbull.result.asErr
import com.github.michaelbull.result.mapError
import kotlin.contracts.InvocationKind
import kotlin.contracts.contract

typealias NetworkResult<T> = Result<T, ApiError>
typealias ApiError = Map<String, List<String>>

val ApiError.message: String
    get() = entries.joinToString(separator = "\n") {
        it.key + ":" + it.value.joinToString()
    }

fun <T> ApiResult<T>.toResult(): Result<T, ApiError> = when (this) {
    is ApiResult.Success<T> -> Ok(this.data)
    is ApiResult.Error<T> -> {
        Logger.w(tag = "Net/ApiResult") { "API error: ${errors.message}" }
        Err(errors)
    }
}

fun <T> Result<ApiResult<T>, Throwable>.unwrapApiResult(): Result<T, ApiError> {
    return this
        .mapError {
            Logger.e(it) { "API error: ${it.message}" }
            mapOf("exception" to listOf(it.message.orEmpty(), it.stackTraceToString()))
        }
        .andThen { it.toResult() }
}

/** Creates a new Result from [transform] that updates both the Success and Err types. */
@OptIn(UnsafeResultValueAccess::class)
inline fun <Ok1, Err1, Ok2, Err2> Result<Ok1, Err1>.flatMapping(transform: (Ok1) -> Result<Ok2, Err2>): Result<Ok2, Err2> {
    contract {
        callsInPlace(transform, InvocationKind.AT_MOST_ONCE)
    }
    return when {
        isOk -> transform(value)
        else -> this.asErr()
    }
}