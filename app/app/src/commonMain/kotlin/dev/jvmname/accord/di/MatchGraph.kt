package dev.jvmname.accord.di

import dev.jvmname.accord.domain.control.RoundConfig
import dev.jvmname.accord.ui.control.ControlTimeType
import dev.jvmname.accord.ui.control.SoloControlTimePresenter
import dev.zacsweers.metro.GraphExtension
import dev.zacsweers.metro.Provides

/**
 * Dependency graph for a single match session.
 * Provides match-scoped dependencies that are shared across components
 * during a match.
 */
@GraphExtension(MatchScope::class)
interface MatchGraph {

    val soloFactory: SoloControlTimePresenter.Factory

    @GraphExtension.Factory
    fun interface Factory {
        operator fun invoke(
            @Provides config: RoundConfig,
            @Provides controlType: ControlTimeType
        ): MatchGraph
    }
}