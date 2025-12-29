package dev.jvmname.accord.di

import com.slack.circuit.foundation.Circuit
import com.slack.circuit.runtime.presenter.Presenter
import com.slack.circuit.runtime.ui.Ui
import dev.zacsweers.metro.AppScope
import dev.zacsweers.metro.DependencyGraph
import dev.zacsweers.metro.Provides
import dev.zacsweers.metro.SingleIn
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlin.time.Clock

@DependencyGraph(scope = AppScope::class)
interface AccordGraph {
    val circuit: Circuit

    @Provides
    @SingleIn(AppScope::class)
    val scope: CoroutineScope
        get() = CoroutineScope(Dispatchers.Main + SupervisorJob())

    @Provides
    @SingleIn(AppScope::class)
    fun circuit(presenterFactories: Set<Presenter.Factory>, uiFactories: Set<Ui.Factory>): Circuit {
        return Circuit.Builder()
            .addPresenterFactories(presenterFactories)
            .addUiFactories(uiFactories)
            .build()
    }

    @DependencyGraph.Factory
    fun interface Factory {
        fun create(
            @Provides context: PlatformContext,
            @Provides clock: Clock,
        ): AccordGraph
    }
}