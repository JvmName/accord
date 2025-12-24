package dev.jvmname.accord.ui.create_mat

import androidx.compose.runtime.Composable
import com.slack.circuit.codegen.annotations.CircuitInject
import com.slack.circuit.runtime.Navigator
import com.slack.circuit.runtime.presenter.Presenter
import dev.jvmname.accord.network.AccordClient
import dev.jvmname.accord.prefs.Prefs
import dev.zacsweers.metro.AppScope
import dev.zacsweers.metro.Assisted
import dev.zacsweers.metro.AssistedFactory
import dev.zacsweers.metro.AssistedInject

@AssistedInject
class CreateMatPresenter(
    @Assisted private val screen: CreateMatScreen,
    @Assisted private val navigator: Navigator,
    private val prefs: Prefs,
    private val client: AccordClient,
) : Presenter<CreateMatState> {
    @Composable
    override fun present(): CreateMatState {
        TODO("Not yet implemented")
    }

    @[AssistedFactory CircuitInject(CreateMatScreen::class, AppScope::class)]
    fun interface Factory {
        fun create(screen: CreateMatScreen, navigator: Navigator): CreateMatPresenter
    }
}