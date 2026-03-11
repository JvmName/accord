package dev.jvmname.accord.di

import dev.jvmname.accord.domain.control.rounds.MatchConfig
import dev.jvmname.accord.domain.session.JudgingSession
import dev.jvmname.accord.domain.session.NetworkJudgeSession
import dev.jvmname.accord.domain.session.SoloMatchSession
import dev.jvmname.accord.ui.control.ControlTimePresenter
import dev.jvmname.accord.ui.control.ControlTimeType
import dev.zacsweers.metro.GraphExtension
import dev.zacsweers.metro.Provides

/**
 * Dependency graph for a single match session.
 * Provides match-scoped dependencies that are shared across components
 * during a match.
 */
@GraphExtension(MatchScope::class)
interface MatchGraph {

    val controlTimePresenterFactory: ControlTimePresenter.Factory

    @GraphExtension.Factory
    interface Factory {
        operator fun invoke(
            @Provides config: MatchConfig,
            @Provides controlType: ControlTimeType,
        ): MatchGraph
    }

    companion object {
        @Provides
        fun provideJudgingSession(
            controlType: ControlTimeType,
            solo: Lazy<SoloMatchSession>,
            judge: Lazy<NetworkJudgeSession>,
        ): JudgingSession = when (controlType) {
            ControlTimeType.SOLO -> solo.value
            ControlTimeType.CONSENSUS -> judge.value
        }
    }
}
