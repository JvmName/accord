package dev.jvmname.accord.ui.showcodes

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import com.github.michaelbull.result.onOk
import com.slack.circuit.codegen.annotations.CircuitInject
import com.slack.circuit.runtime.Navigator
import com.slack.circuit.runtime.presenter.Presenter
import dev.jvmname.accord.di.MatchRole
import dev.jvmname.accord.domain.MatManager
import dev.jvmname.accord.domain.control.rounds.MatchConfig
import dev.jvmname.accord.network.adminCode
import dev.jvmname.accord.network.viewerCode
import dev.jvmname.accord.ui.session.master.MasterSessionScreen
import dev.jvmname.accord.ui.trampoline.TrampolineMatchGraphScreen
import dev.zacsweers.metro.AppScope
import dev.zacsweers.metro.Assisted
import dev.zacsweers.metro.AssistedFactory
import dev.zacsweers.metro.AssistedInject
import kotlinx.coroutines.delay
import kotlin.time.Duration.Companion.seconds

@AssistedInject
class ShowCodesPresenter(
    @Assisted private val screen: ShowCodesScreen,
    @Assisted private val navigator: Navigator,
    private val matManager: MatManager,
) : Presenter<ShowCodesState> {

    @Composable
    override fun present(): ShowCodesState {
        val joinedJudges by produceState(emptyList(), key1 = screen) {
            val adminCode = screen.mat.adminCode.code
            while (true) {
                matManager.listJudges(adminCode).onOk { value = it }
                delay(1.5.seconds)
            }
        }

        return ShowCodesState(
            adminCode = screen.mat.adminCode.code,
            viewerCode = screen.mat.viewerCode.code,
            joinedJudges = joinedJudges,
            allJudgesJoined = screen.mat.judgeCount == joinedJudges.size,
        ) { event ->
            when (event) {
                ShowCodesEvent.Ready -> navigator.goTo(
                    TrampolineMatchGraphScreen(
                        innerRoot = MasterSessionScreen(matchId = screen.match.id),
                        match = screen.match,
                        matchConfig = MatchConfig.RdojoKombat,
                        matchRole = MatchRole.MASTER,
                    )
                )

                ShowCodesEvent.Back -> navigator.pop()
            }
        }
    }

    @[AssistedFactory CircuitInject(ShowCodesScreen::class, AppScope::class)]
    fun interface Factory {
        fun create(screen: ShowCodesScreen, navigator: Navigator): ShowCodesPresenter
    }
}
