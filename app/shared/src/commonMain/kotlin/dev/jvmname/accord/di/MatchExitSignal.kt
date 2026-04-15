package dev.jvmname.accord.di

import dev.zacsweers.metro.Inject
import dev.zacsweers.metro.SingleIn
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow

@[Inject SingleIn(MatchScope::class)]
class MatchExitSignal {
    private val _exitToMain = MutableSharedFlow<Unit>(extraBufferCapacity = 1)
    val exitToMain: SharedFlow<Unit> = _exitToMain.asSharedFlow()

    fun requestExitToMain() {
        _exitToMain.tryEmit(Unit)
    }
}
