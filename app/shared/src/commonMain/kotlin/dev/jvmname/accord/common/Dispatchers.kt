package dev.jvmname.accord.common

import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.MainCoroutineDispatcher

public expect object Dispatchers {
    public val Default: CoroutineDispatcher
    public val Main: MainCoroutineDispatcher
    public val IO: CoroutineDispatcher 
}
