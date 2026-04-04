package dev.jvmname.accord.ui.join

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import co.touchlab.kermit.Logger
import com.slack.circuit.codegen.annotations.CircuitInject
import com.slack.circuit.runtime.Navigator
import com.slack.circuit.runtime.presenter.Presenter
import dev.jvmname.accord.di.MatchRole
import dev.jvmname.accord.domain.MatManager
import dev.jvmname.accord.domain.control.rounds.MatchConfig
import dev.jvmname.accord.network.Role
import dev.jvmname.accord.network.message
import dev.jvmname.accord.ui.onEither
import dev.jvmname.accord.ui.session.judging.JudgeSessionScreen
import dev.jvmname.accord.ui.session.viewer.ViewerScreen
import dev.jvmname.accord.ui.trampoline.TrampolineMatchGraphScreen
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
    private val scope: CoroutineScope,
) : Presenter<JoinMatState> {

    private val log = Logger.withTag("UI/JoinMat")

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
                        log.i { "join attempt code=${it.code.split('.').first()}..." }
                        matManager.joinMat(it.code, it.name)
                            .onEither(
                                success = { mat ->
                                    val match = mat.currentMatch
                                        ?: mat.upcomingMatches.firstOrNull()
                                        ?: run {
                                            error = "No matches on this mat yet"
                                            log.e { "No matches on this mat ${mat.id} yet" }
                                            return@onEither
                                        }
                                    val currentUserId = matManager.currentUserId()
                                    val isJudge = mat.judges.any { j -> j.id == currentUserId }
                                        || mat.codes.find { c -> c.code == it.code }?.role == Role.ADMIN
                                    val role = if (isJudge) MatchRole.JUDGE else MatchRole.VIEWER
                                    val next = when {
                                        isJudge -> TrampolineMatchGraphScreen(
                                            innerRoot = JudgeSessionScreen,
                                            match = match,
                                            matchConfig = MatchConfig.RdojoKombat,
                                            matchRole = MatchRole.JUDGE,
                                        )
                                        else -> TrampolineMatchGraphScreen(
                                            innerRoot = ViewerScreen(mat.id),
                                            match = match,
                                            matchConfig = MatchConfig.RdojoKombat,
                                            matchRole = MatchRole.VIEWER,
                                        )
                                    }
                                    log.i { "joined as $role → navigating to $next" }
                                    navigator.goTo(next)
                                },
                                failure = {
                                    val errorMessage = it.message ?: "Failed to join mat"
                                    log.w { "join failed: $errorMessage" }
                                    error = errorMessage
                                }
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
