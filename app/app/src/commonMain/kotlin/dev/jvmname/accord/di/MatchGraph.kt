package dev.jvmname.accord.di

import com.slack.circuit.foundation.Circuit
import com.slack.circuit.runtime.presenter.Presenter
import com.slack.circuit.runtime.ui.Ui
import dev.jvmname.accord.domain.control.rounds.MatchConfig
import dev.jvmname.accord.domain.session.JudgingSession
import dev.jvmname.accord.domain.session.NetworkJudgeSession
import dev.jvmname.accord.domain.session.SoloMatchSession
import dev.jvmname.accord.network.Match
import dev.zacsweers.metro.GraphExtension
import dev.zacsweers.metro.Provides
import dev.zacsweers.metro.SingleIn

@GraphExtension(MatchScope::class)
interface MatchGraph {

    val circuit: Circuit
    val exitSignal: MatchExitSignal

    @GraphExtension.Factory
    interface Factory {
        operator fun invoke(
            @Provides match: Match,
            @Provides config: MatchConfig,
            @Provides role: MatchRole,
        ): MatchGraph
    }

    companion object {
        @Provides
        @SingleIn(MatchScope::class)
        fun circuit(
            presenterFactories: Set<Presenter.Factory>,
            uiFactories: Set<Ui.Factory>,
        ): Circuit = Circuit.Builder()
            .addPresenterFactories(presenterFactories)
            .addUiFactories(uiFactories)
            .build()

        @Provides
        fun provideJudgingSession(
            role: MatchRole,
            solo: Lazy<SoloMatchSession>,
            judge: Lazy<NetworkJudgeSession>,
        ): JudgingSession = when (role) {
            MatchRole.SOLO -> solo.value
            MatchRole.JUDGE -> judge.value
            MatchRole.MASTER, MatchRole.VIEWER -> judge.value
        }
    }
}
