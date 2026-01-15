package dev.jvmname.accord.di

import dev.jvmname.accord.domain.MatchManager
import dev.jvmname.accord.domain.control.rounds.NetworkRoundTracker
import dev.jvmname.accord.domain.control.rounds.RoundConfig
import dev.jvmname.accord.domain.control.rounds.RoundTracker
import dev.jvmname.accord.domain.control.rounds.SoloRoundTracker
import dev.jvmname.accord.network.MatchId
import dev.jvmname.accord.ui.control.ConsensusControlTimePresenter
import dev.jvmname.accord.ui.control.ControlTimeType
import dev.jvmname.accord.ui.control.SoloControlTimePresenter
import dev.zacsweers.metro.GraphExtension
import dev.zacsweers.metro.Provides
import kotlinx.coroutines.CoroutineScope

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
            @Provides config: RoundConfig,
            @Provides controlType: ControlTimeType,
            @Provides matchId: MatchId? = null
        ): MatchGraph
    }

    companion object {
        @Provides
        fun provideRoundTracker(
            scope: CoroutineScope,
            config: RoundConfig,
            controlType: ControlTimeType,
            matchId: MatchId?,
            matchManager: MatchManager
        ): RoundTracker {
            return when (controlType) {
                ControlTimeType.SOLO -> SoloRoundTracker(scope, config)
                ControlTimeType.CONSENSUS -> {
                    requireNotNull(matchId) { "MatchId is required for network round tracker" }
                    NetworkRoundTracker(scope, matchManager, matchId)
                }
            }
        }
    }
}