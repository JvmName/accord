package dev.jvmname.accord.ui.main

import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import com.slack.circuit.codegen.annotations.CircuitInject
import com.slack.circuit.runtime.Navigator
import com.slack.circuit.runtime.presenter.Presenter
import dev.jvmname.accord.di.MatchRole
import dev.jvmname.accord.domain.MatManager
import dev.jvmname.accord.domain.control.rounds.MatchConfig
import dev.jvmname.accord.domain.control.rounds.MatchConfig.Companion.RdojoKombat
import dev.jvmname.accord.domain.control.rounds.RoundInfo
import dev.jvmname.accord.network.MatId
import dev.jvmname.accord.network.Match
import dev.jvmname.accord.network.MatchId
import dev.jvmname.accord.network.Round
import dev.jvmname.accord.network.RoundId
import dev.jvmname.accord.network.RoundResult
import dev.jvmname.accord.network.RoundResultMethod
import dev.jvmname.accord.network.User
import dev.jvmname.accord.network.UserId
import dev.jvmname.accord.prefs.Prefs
import dev.jvmname.accord.ui.create.mat.CreateMatMatchScreen
import dev.jvmname.accord.ui.create.newmatch.NewMatchScreen
import dev.jvmname.accord.ui.join.JoinMatScreen
import dev.jvmname.accord.ui.main.MainEvent.ContinueMat
import dev.jvmname.accord.ui.session.judging.JudgeSessionScreen
import dev.jvmname.accord.ui.trampoline.TrampolineMatchGraphScreen
import dev.zacsweers.metro.AppScope
import dev.zacsweers.metro.Assisted
import dev.zacsweers.metro.AssistedFactory
import dev.zacsweers.metro.AssistedInject
import kotlinx.coroutines.Dispatchers
import kotlin.time.Clock

@AssistedInject
class MainPresenter(
    @Assisted private val screen: MainScreen,
    @Assisted private val navigator: Navigator,
    private val prefs: Prefs,
    private val matManager: MatManager,
) : Presenter<MainState> {


    @Composable
    override fun present(): MainState {
        val matInfo by remember { prefs.observeMatInfo() }
            .collectAsState(null, Dispatchers.IO)

        return MainState(matInfo) {
            when (it) {
                MainEvent.CreateMat -> navigator.goTo(CreateMatMatchScreen)

                MainEvent.JoinMat -> navigator.goTo(JoinMatScreen())

                ContinueMat -> navigator.goTo(NewMatchScreen) // TODO: NewMatchScreen built in task 10

                MainEvent.SoloRideTime -> {
                    navigator.goTo(
                        TrampolineMatchGraphScreen(
                            innerRoot = JudgeSessionScreen,
                            match = Match(
                                id = MatchId("localMatchId"),
                                creatorId = UserId("me"),
                                matId = MatId("localMatId"),
                                startedAt = Clock.System.now(),
                                endedAt = null,
                                red = User(UserId("red"), "Red"),
                                blue = User(UserId("blue"), "Blue"),
                                judges = emptyList(),
                                rounds = RdojoKombat.rounds
                                    .filterIsInstance<RoundInfo.Round>()
                                    .map { roundInfo ->
                                        Round(
                                            id = RoundId("round_${roundInfo.index}"),
                                            maxDuration = roundInfo.duration.inWholeSeconds.toInt(),
                                            startedAt = Clock.System.now(),
                                            endedAt = null,
                                            score = emptyMap(),
                                            result = RoundResult(
                                                winner = null,
                                                method = RoundResultMethod(type = null, value = null),
                                            ),
                                        )
                                    }
                            ),
                            matchConfig = MatchConfig.RdojoKombat,
                            matchRole = MatchRole.SOLO,
                        )
                    )
                }
            }
        }
    }

    @[AssistedFactory CircuitInject(MainScreen::class, AppScope::class)]
    fun interface Factory {
        fun create(screen: MainScreen, navigator: Navigator): MainPresenter
    }
}
