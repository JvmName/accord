package dev.jvmname.accord.ui.create.mat

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import com.slack.circuit.codegen.annotations.CircuitInject
import com.slack.circuit.runtime.Navigator
import com.slack.circuit.runtime.presenter.Presenter
import dev.jvmname.accord.domain.MatManager
import dev.jvmname.accord.network.message
import dev.jvmname.accord.ui.onEither
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
    @Composable
    override fun present(): CreateMatMatchState {
        var loading by remember { mutableStateOf(false) }
        var error by remember { mutableStateOf<String?>(null) }

        return CreateMatMatchState(loading, error) { event ->
            when (event) {
                CreateMatMatchEvent.Back -> navigator.pop(result = null)

                is CreateMatMatchEvent.CreateMat -> {
                    if (loading) return@CreateMatMatchState
                    scope.launch {
                        loading = true
                        error = null


                        matManager.createMatAndMatch(
                            name = event.name,
                            redName = event.redName,
                            blueName = event.blueName,
                            judgeCount = event.count,
                            //TODO isjudging
                        )
                            .onEither(
                                success = { (mat, match) ->
                                    navigator.pop(result = CreateMatMatchScreen.CreateMatResult(mat))
                                },
                                failure = { error = "Error creating mat: ${it.message}" }
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