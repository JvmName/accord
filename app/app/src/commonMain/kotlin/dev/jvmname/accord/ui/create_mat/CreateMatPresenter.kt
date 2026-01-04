package dev.jvmname.accord.ui.create_mat

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import com.slack.circuit.codegen.annotations.CircuitInject
import com.slack.circuit.runtime.Navigator
import com.slack.circuit.runtime.presenter.Presenter
import dev.jvmname.accord.domain.MatCreator
import dev.jvmname.accord.ui.onEither
import dev.zacsweers.metro.AppScope
import dev.zacsweers.metro.Assisted
import dev.zacsweers.metro.AssistedFactory
import dev.zacsweers.metro.AssistedInject
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch

@AssistedInject
class CreateMatPresenter(
    @Assisted private val navigator: Navigator,
    private val scope: CoroutineScope,
    private val matCreator: MatCreator
) : Presenter<CreateMatState> {
    @Composable
    override fun present(): CreateMatState {
        var loading by remember { mutableStateOf(false) }
        var error by remember { mutableStateOf<String?>(null) }

        return CreateMatState(loading, error) { event ->
            when (event) {
                CreateMatEvent.Back -> navigator.pop(result = null)

                is CreateMatEvent.CreateMat -> {
                    if (loading) return@CreateMatState
                    scope.launch {
                        loading = true
                        error = null

                        matCreator.createMat(event.name, event.count)
                            .onEither(
                                success = {
                                    navigator.pop(
                                        result = CreateMatScreen.CreateMatResult(it)
                                    )
                                },
                                failure = { error = "Error creating mat: ${it.localizedMessage}" }
                            )
                        loading = false
                    }
                }
            }
        }
    }

    @[AssistedFactory CircuitInject(CreateMatScreen::class, AppScope::class)]
    fun interface Factory {
        fun create(navigator: Navigator): CreateMatPresenter
    }
}