package dev.jvmname.accord.network

import com.github.michaelbull.result.Err
import com.github.michaelbull.result.Ok
import com.github.michaelbull.result.Result
import com.github.michaelbull.result.andThen
import com.github.michaelbull.result.mapError

typealias ApiError = Map<String, List<String>>

fun <T> ApiResult<T>.toResult(): Result<T, ApiError> {
    return when (this) {
        is ApiResult.Success<T> -> Ok(this.data)
        is ApiResult.Error<T> -> Err(errors)
    }
}

fun <T> Result<ApiResult<T>, Throwable>.unwrapApiResult(): Result<T, ApiError> {
    return this
        .mapError { mapOf("exception" to listOf(it.message ?: "Network error")) }
        .andThen { it.toResult() }
}