package dev.jvmname.accord.ui.create.mat

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import co.touchlab.kermit.Logger
import com.slack.circuit.codegen.annotations.CircuitInject
import com.slack.circuit.runtime.Navigator
import com.slack.circuit.runtime.presenter.Presenter
import dev.jvmname.accord.domain.MatManager
import dev.jvmname.accord.network.message
import dev.jvmname.accord.ui.onEither
import dev.jvmname.accord.ui.showcodes.ShowCodesScreen
import dev.zacsweers.metro.AppScope
import dev.zacsweers.metro.Assisted
import dev.zacsweers.metro.AssistedFactory
import dev.zacsweers.metro.AssistedInject
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch

@AssistedInject
class CreateMatMatchPresenter(
    @Assisted private val navigator: Navigator,
    private val scope: CoroutineScope,
    private val matManager: MatManager,
) : Presenter<CreateMatMatchState> {
    private val log = Logger.withTag("UI/CreateMat")

    @Composable
    override fun present(): CreateMatMatchState {
        var loading by remember { mutableStateOf(false) }
        var error by remember { mutableStateOf<String?>(null) }

        return CreateMatMatchState(loading, error) { event ->
            when (event) {
                CreateMatMatchEvent.Back -> navigator.pop()

                is CreateMatMatchEvent.CreateMat -> {
                    if (loading) return@CreateMatMatchState
                    scope.launch {
                        loading = true
                        error = null
                        log.i { "creating mat name='${event.matName}' judges=${event.judgeCount}" }

                        matManager.createMatAndMatch(
                            masterName = event.masterName,
                            matName = event.matName,
                            judgeCount = event.judgeCount,
                            redName = event.redName,
                            blueName = event.blueName,
                        )
                            //TODO if the creator wants to join a judge, then we'd .join here
                            .onEither(
                            success = { (mat, match) ->
                                log.i { "mat+match created, navigating to ShowCodes" }
                                navigator.goTo(ShowCodesScreen(mat = mat, match = match))
                            },
                            failure = {
                                val errorMessage = "Error creating mat: ${it.message}"
                                log.w { "mat creation failed: ${it.message}" }
                                error = errorMessage
                            }
                        )
                        loading = false
                    }
                }
            }
        }
    }

    @[AssistedFactory CircuitInject(CreateMatMatchScreen::class, AppScope::class)]
    fun interface Factory {
        fun create(navigator: Navigator): CreateMatMatchPresenter
    }
}
