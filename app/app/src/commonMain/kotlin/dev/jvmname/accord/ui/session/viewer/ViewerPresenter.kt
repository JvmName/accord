package dev.jvmname.accord.ui.session.viewer

import androidx.compose.runtime.Composable
import com.slack.circuit.codegen.annotations.CircuitInject
import com.slack.circuit.runtime.Navigator
import com.slack.circuit.runtime.presenter.Presenter
import dev.jvmname.accord.di.MatchExitSignal
import dev.jvmname.accord.di.MatchScope
import dev.zacsweers.metro.Assisted
import dev.zacsweers.metro.AssistedFactory
import dev.zacsweers.metro.AssistedInject

@AssistedInject
class ViewerPresenter(
    @Assisted private val screen: ViewerScreen,
    @Assisted private val navigator: Navigator,
    // TODO: inject MatchManager for socket observation
    private val exitSignal: MatchExitSignal,
) : Presenter<ViewerState> {

    @Composable
    override fun present(): ViewerState {
        // TODO: observe match via MatchManager.observeCurrentMatch()
        // TODO: connect socket via MatchManager.joinMatch when match is available
        return ViewerState { event ->
            when (event) {
                ViewerEvent.Back -> navigator.pop()
            }
        }
    }

    @[AssistedFactory CircuitInject(ViewerScreen::class, MatchScope::class)]
    fun interface Factory {
        operator fun invoke(screen: ViewerScreen, navigator: Navigator): ViewerPresenter
    }
}
