package dev.jvmname.accord.ui.create.newmatch

import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
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
import dev.jvmname.accord.prefs.Prefs
import dev.jvmname.accord.ui.onEither
import dev.jvmname.accord.ui.showcodes.ShowCodesScreen
import dev.zacsweers.metro.AppScope
import dev.zacsweers.metro.Assisted
import dev.zacsweers.metro.AssistedFactory
import dev.zacsweers.metro.AssistedInject
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch

@AssistedInject
class NewMatchPresenter(
    @Assisted private val navigator: Navigator,
    private val matManager: MatManager,
    private val prefs: Prefs,
    private val scope: CoroutineScope,
) : Presenter<NewMatchState> {

    private val log = Logger.withTag("UI/NewMatch")

    @Composable
    override fun present(): NewMatchState {
        val mat by remember { prefs.observeMatInfo() }.collectAsState(null)
        var loading by remember { mutableStateOf(false) }
        var error by remember { mutableStateOf<String?>(null) }

        return NewMatchState(
            matName = mat?.name ?: "",
            loading = loading,
            error = error,
        ) { event ->
            when (event) {
                NewMatchEvent.Back -> navigator.pop()
                is NewMatchEvent.CreateMatch -> {
                    if (loading) return@NewMatchState
                    scope.launch {
                        loading = true
                        error = null
                        log.i { "creating match on mat=${mat?.id}" }
                        matManager.createMatch(event.redName, event.blueName)
                            .onEither(
                                success = { match ->
                                    log.i { "match created id=${match.id}" }
                                    val matNN = mat!!
                                    navigator.goTo(ShowCodesScreen(mat = matNN, match = match, judgeCount = matNN.judgeCount))
                                },
                                failure = {
                                    log.w { "match creation failed: ${it.message}" }
                                    error = it.message
                                }
                            )
                        loading = false
                    }
                }
            }
        }
    }

    @[AssistedFactory CircuitInject(NewMatchScreen::class, AppScope::class)]
    fun interface Factory {
        fun create(navigator: Navigator): NewMatchPresenter
    }
}
