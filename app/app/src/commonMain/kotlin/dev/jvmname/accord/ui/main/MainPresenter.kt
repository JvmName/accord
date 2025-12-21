package dev.jvmname.accord.ui.main

import androidx.compose.runtime.Composable
import com.slack.circuit.codegen.annotations.CircuitInject
import com.slack.circuit.runtime.presenter.Presenter
import dev.zacsweers.metro.AppScope
import dev.zacsweers.metro.Assisted
import dev.zacsweers.metro.AssistedFactory
import dev.zacsweers.metro.AssistedInject

@AssistedInject
class MainPresenter(
    @Assisted private val screen: MainScreen
) : Presenter<MainState> {


    @Composable
    override fun present(): MainState {
        TODO("Not yet implemented")
    }

    @[AssistedFactory CircuitInject(MainScreen::class, AppScope::class)]
    fun interface Factory {
        fun create(screen: MainScreen): MainPresenter
    }
}