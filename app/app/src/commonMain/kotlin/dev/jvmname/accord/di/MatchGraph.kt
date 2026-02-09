package dev.jvmname.accord.di

import dev.jvmname.accord.domain.control.rounds.MatchConfig
import dev.jvmname.accord.domain.control.rounds.RoundTracker
import dev.jvmname.accord.domain.control.score.ScoreKeeper
import dev.jvmname.accord.network.MatchId
import dev.jvmname.accord.ui.control.ConsensusControlTimePresenter
import dev.jvmname.accord.ui.control.ControlTimeType
import dev.jvmname.accord.ui.control.SoloControlTimePresenter
import dev.zacsweers.metro.GraphExtension
import dev.zacsweers.metro.Provides
import dev.zacsweers.metro.Qualifier

/**
 * Dependency graph for a single match session.
 * Provides match-scoped dependencies that are shared across components
 * during a match.
 */
@GraphExtension(MatchScope::class)
interface MatchGraph {

    val soloFactory: SoloControlTimePresenter.Factory
    val consensusFactory: ConsensusControlTimePresenter.Factory

    @GraphExtension.Factory
    interface Factory {
        operator fun invoke(
            @Provides config: MatchConfig,
            @Provides controlType: ControlTimeType,
            @Provides matchId: MatchId? = null
        ): MatchGraph
    }

    companion object {
        @Provides
        fun provideScoreKeeper(
            controlType: ControlTimeType,
                @ForControlType(ControlTimeType.SOLO) solo: Lazy<RoundTracker>,
                @ForControlType(ControlTimeType.CONSENSUS) consensus: Lazy<RoundTracker>,
        ): RoundTracker = when (controlType) {
            ControlTimeType.SOLO -> solo.value
            ControlTimeType.CONSENSUS -> consensus.value
        }

        @Provides
        fun provideRoundTracker(
            controlType: ControlTimeType,
            @ForControlType(ControlTimeType.SOLO) solo: Lazy<ScoreKeeper>,
            @ForControlType(ControlTimeType.CONSENSUS) consensus: Lazy<ScoreKeeper>,
        ): ScoreKeeper = when (controlType) {
            ControlTimeType.SOLO -> solo.value
            ControlTimeType.CONSENSUS -> consensus.value
        }
    }
}

@Qualifier
annotation class ForControlType(val type: ControlTimeType)