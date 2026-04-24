package dev.jvmname.accord.common

import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.MainCoroutineDispatcher

import kotlinx.coroutines.Dispatchers as KxDispatcher

actual object Dispatchers {
    actual val Default: CoroutineDispatcher = KxDispatcher.Default
    actual val Main: MainCoroutineDispatcher = KxDispatcher.Main
    actual val IO: CoroutineDispatcher = KxDispatcher.Default
}