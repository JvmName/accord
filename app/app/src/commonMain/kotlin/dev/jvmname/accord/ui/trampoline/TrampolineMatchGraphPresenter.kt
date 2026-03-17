package dev.jvmname.accord.ui.trampoline

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import com.slack.circuit.codegen.annotations.CircuitInject
import com.slack.circuit.runtime.Navigator
import com.slack.circuit.runtime.popUntil
import com.slack.circuit.runtime.presenter.Presenter
import dev.jvmname.accord.di.MatchGraph
import dev.jvmname.accord.ui.main.MainScreen
import dev.zacsweers.metro.AppScope
import dev.zacsweers.metro.Assisted
import dev.zacsweers.metro.AssistedFactory
import dev.zacsweers.metro.AssistedInject

@AssistedInject
class TrampolineMatchGraphPresenter(
    @Assisted private val screen: TrampolineMatchGraphScreen,
    @Assisted private val navigator: Navigator,
    private val matchGraphFactory: MatchGraph.Factory,
) : Presenter<TrampolineMatchGraphState> {

    @Composable
    override fun present(): TrampolineMatchGraphState {
        val matchGraph = remember(screen) {
            matchGraphFactory(screen.match, screen.matchConfig, screen.matchRole)
        }

        LaunchedEffect(matchGraph) {
            matchGraph.exitSignal.exitToMain.collect {
                navigator.popUntil { it is MainScreen }
            }
        }

        return TrampolineMatchGraphState(
            matchGraph = matchGraph,
            innerRoot = screen.innerRoot,
            onRootPop = { navigator.pop() },
        )
    }

    @[AssistedFactory CircuitInject(TrampolineMatchGraphScreen::class, AppScope::class)]
    fun interface Factory {
        fun create(
            screen: TrampolineMatchGraphScreen,
            navigator: Navigator,
        ): TrampolineMatchGraphPresenter
    }
}
