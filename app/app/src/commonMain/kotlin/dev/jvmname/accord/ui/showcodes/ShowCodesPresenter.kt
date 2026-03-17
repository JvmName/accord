package dev.jvmname.accord.ui.showcodes

import androidx.compose.runtime.Composable
import com.slack.circuit.codegen.annotations.CircuitInject
import com.slack.circuit.runtime.Navigator
import com.slack.circuit.runtime.presenter.Presenter
import dev.jvmname.accord.di.MatchRole
import dev.jvmname.accord.domain.control.rounds.MatchConfig
import dev.jvmname.accord.ui.master.MasterSessionScreen
import dev.jvmname.accord.ui.trampoline.TrampolineMatchGraphScreen
import dev.zacsweers.metro.AppScope
import dev.zacsweers.metro.Assisted
import dev.zacsweers.metro.AssistedFactory
import dev.zacsweers.metro.AssistedInject

@AssistedInject
class ShowCodesPresenter(
    @Assisted private val screen: ShowCodesScreen,
    @Assisted private val navigator: Navigator,
) : Presenter<ShowCodesState> {

    @Composable
    override fun present(): ShowCodesState {
        return ShowCodesState(screen.mat, screen.match) { event ->
            when (event) {
                ShowCodesEvent.Ready -> {
                    navigator.goTo(
                        TrampolineMatchGraphScreen(
                            innerRoot = MasterSessionScreen(matchId = screen.match.id),
                            match = screen.match,
                            matchConfig = MatchConfig.RdojoKombat,
                            matchRole = MatchRole.MASTER,
                        )
                    )
                }
                ShowCodesEvent.Back -> navigator.pop()
            }
        }
    }

    @[AssistedFactory CircuitInject(ShowCodesScreen::class, AppScope::class)]
    fun interface Factory {
        fun create(screen: ShowCodesScreen, navigator: Navigator): ShowCodesPresenter
    }
}
