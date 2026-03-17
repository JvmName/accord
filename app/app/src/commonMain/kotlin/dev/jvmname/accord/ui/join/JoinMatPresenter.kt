package dev.jvmname.accord.ui.join

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import com.slack.circuit.codegen.annotations.CircuitInject
import com.slack.circuit.runtime.Navigator
import com.slack.circuit.runtime.presenter.Presenter
import dev.jvmname.accord.di.MatchRole
import dev.jvmname.accord.domain.MatManager
import dev.jvmname.accord.domain.MatchManager
import dev.jvmname.accord.domain.control.rounds.MatchConfig
import dev.jvmname.accord.network.Role
import dev.jvmname.accord.network.message
import dev.jvmname.accord.ui.control.ControlTimeScreen
import dev.jvmname.accord.ui.control.ControlTimeType
import dev.jvmname.accord.ui.onEither
import dev.jvmname.accord.ui.trampoline.TrampolineMatchGraphScreen
import dev.jvmname.accord.ui.viewer.ViewerScreen
import dev.zacsweers.metro.AppScope
import dev.zacsweers.metro.Assisted
import dev.zacsweers.metro.AssistedFactory
import dev.zacsweers.metro.AssistedInject
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch

@AssistedInject
class JoinMatPresenter(
    @Assisted private val screen: JoinMatScreen,
    @Assisted private val navigator: Navigator,
    private val matManager: MatManager,
    private val matchManager: MatchManager,
    private val scope: CoroutineScope,
) : Presenter<JoinMatState> {

    @Composable
    override fun present(): JoinMatState {
        var loading by remember { mutableStateOf(false) }
        var error by remember { mutableStateOf<String?>(null) }

        return JoinMatState(loading = loading, error = error) {
            when (it) {
                JoinMatEvent.Back -> navigator.pop()
                is JoinMatEvent.OnJoinCodeEntered -> {
                    if (loading) return@JoinMatState
                    scope.launch {
                        loading = true
                        error = null
                        matManager.joinMat(it.code, it.name)
                            .onEither(
                                success = { mat ->
                                    val currentMatch = mat.currentMatch ?: run {
                                        error = "No active match on this mat yet"
                                        return@onEither
                                    }
                                    matchManager.joinMatch(currentMatch)
                                    val role = mat.codes.find { c -> c.code == it.code }?.role
                                    if (role == Role.ADMIN) {
                                        navigator.goTo(TrampolineMatchGraphScreen(
                                            innerRoot = ControlTimeScreen(ControlTimeType.CONSENSUS),
                                            match = currentMatch,
                                            matchConfig = MatchConfig.RdojoKombat,
                                            matchRole = MatchRole.JUDGE,
                                        ))
                                    } else {
                                        navigator.goTo(TrampolineMatchGraphScreen(
                                            innerRoot = ViewerScreen(mat.id),
                                            match = currentMatch,
                                            matchConfig = MatchConfig.RdojoKombat,
                                            matchRole = MatchRole.VIEWER,
                                        ))
                                    }
                                },
                                failure = { error = it.message ?: "Failed to join mat" }
                            )
                        loading = false
                    }
                }
            }
        }
    }

    @[AssistedFactory CircuitInject(JoinMatScreen::class, AppScope::class)]
    fun interface Factory {
        operator fun invoke(screen: JoinMatScreen, navigator: Navigator): JoinMatPresenter
    }
}
