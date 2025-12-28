package dev.jvmname.accord.ui.main

import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import com.slack.circuit.codegen.annotations.CircuitInject
import com.slack.circuit.foundation.rememberAnsweringNavigator
import com.slack.circuit.runtime.Navigator
import com.slack.circuit.runtime.presenter.Presenter
import dev.jvmname.accord.prefs.Prefs
import dev.jvmname.accord.ui.create_mat.CreateMatScreen
import dev.zacsweers.metro.AppScope
import dev.zacsweers.metro.Assisted
import dev.zacsweers.metro.AssistedFactory
import dev.zacsweers.metro.AssistedInject
import kotlinx.coroutines.Dispatchers

@AssistedInject
class MainPresenter(
    @Assisted private val screen: MainScreen,
    @Assisted private val navigator: Navigator,
    private val prefs: Prefs,
) : Presenter<MainState> {


    @Composable
    override fun present(): MainState {
        val matInfo by remember { prefs.observeMatInfo() }
            .collectAsState(null, Dispatchers.IO)

        var matInfoResult by remember { mutableStateOf(matInfo) }

        val createMatNav = rememberAnsweringNavigator<CreateMatScreen.CreateMatResult>(navigator) {
            matInfoResult = it.mat
        }

        return MainState(matInfoResult) {
            when (it) {
                MainEvent.CreateMat -> createMatNav.goTo(CreateMatScreen)

                MainEvent.JoinMat -> TODO()
                MainEvent.SoloRideTime ->
            }
        }
    }

    @[AssistedFactory CircuitInject(MainScreen::class, AppScope::class)]
    fun interface Factory {
        fun create(screen: MainScreen, navigator: Navigator): MainPresenter
    }
}