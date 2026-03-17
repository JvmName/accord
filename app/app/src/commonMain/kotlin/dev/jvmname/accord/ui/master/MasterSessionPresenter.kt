package dev.jvmname.accord.ui.master

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import com.slack.circuit.codegen.annotations.CircuitInject
import com.slack.circuit.runtime.Navigator
import com.slack.circuit.runtime.presenter.Presenter
import dev.jvmname.accord.di.MatchExitSignal
import dev.jvmname.accord.di.MatchScope
import dev.jvmname.accord.domain.MatchManager
import dev.jvmname.accord.network.Match
import dev.jvmname.accord.network.UserId
import dev.jvmname.accord.network.message
import dev.jvmname.accord.prefs.Prefs
import dev.jvmname.accord.ui.onEither
import dev.jvmname.accord.ui.showcodes.ShowCodesScreen
import dev.zacsweers.metro.Assisted
import dev.zacsweers.metro.AssistedFactory
import dev.zacsweers.metro.AssistedInject
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

@AssistedInject
class MasterSessionPresenter(
    @Assisted private val screen: MasterSessionScreen,
    @Assisted private val navigator: Navigator,
    private val matchManager: MatchManager,
    private val prefs: Prefs,
    private val exitSignal: MatchExitSignal,
    private val scope: CoroutineScope,
) : Presenter<MasterSessionState> {

    @Composable
    override fun present(): MasterSessionState {
        val match by remember { matchManager.observeCurrentMatch() }.collectAsState(null)
        var error by remember { mutableStateOf<String?>(null) }
        var elapsedSeconds by remember { mutableLongStateOf(0L) }
        var isPaused by remember { mutableStateOf(false) }
        // Note: isPaused is managed as local optimistic state — the server Round model does not
        // expose pause state, so we toggle it on button press and let PauseRound/ResumeRound
        // confirm server-side. State resets on recomposition if navigated away.

        val isMatchStarted = match?.startedAt != null
        val isMatchEnded = match?.endedAt != null

        LaunchedEffect(match?.id, isPaused) {
            if (isMatchStarted && !isMatchEnded && !isPaused) {
                while (true) {
                    delay(1000)
                    elapsedSeconds++
                }
            }
        }

        val redScore = match?.let { scoreForCompetitor(it, it.red.id) } ?: 0
        val blueScore = match?.let { scoreForCompetitor(it, it.blue.id) } ?: 0
        val roundNumber = match?.rounds?.size ?: 0

        return MasterSessionState(
            matchId = screen.matchId,
            redName = match?.red?.name ?: "Red",
            blueName = match?.blue?.name ?: "Blue",
            redScore = redScore,
            blueScore = blueScore,
            elapsedSeconds = elapsedSeconds,
            roundNumber = roundNumber,
            isMatchStarted = isMatchStarted,
            isMatchEnded = isMatchEnded,
            isPaused = isPaused,
            error = error,
        ) { event ->
            when (event) {
                MasterSessionEvent.StartMatch -> scope.launch {
                    matchManager.startMatch()
                        .onEither(
                            success = { /* match updated via flow */ },
                            failure = { error = it.message }
                        )
                }
                MasterSessionEvent.PauseRound -> {
                    isPaused = true
                    scope.launch {
                        matchManager.pauseRound(screen.matchId)
                            .onEither(
                                success = { /* match updated via flow */ },
                                failure = { error = it.message }
                            )
                    }
                }
                MasterSessionEvent.ResumeRound -> {
                    isPaused = false
                    scope.launch {
                        matchManager.resumeRound(screen.matchId)
                            .onEither(
                                success = { /* match updated via flow */ },
                                failure = { error = it.message }
                            )
                    }
                }
                is MasterSessionEvent.EndRound -> scope.launch {
                    matchManager.endRound(screen.matchId, event.submission, event.submitter)
                        .onEither(
                            success = { /* match updated via flow */ },
                            failure = { error = it.message }
                        )
                }
                MasterSessionEvent.StartNextRound -> scope.launch {
                    matchManager.startRound()
                        .onEither(
                            success = { /* match updated via flow */ },
                            failure = { error = it.message }
                        )
                }
                MasterSessionEvent.EndMatch -> scope.launch {
                    matchManager.endMatch()
                        .onEither(
                            success = { exitSignal.requestExitToMain() },
                            failure = { error = it.message }
                        )
                }
                MasterSessionEvent.ShowCodes -> scope.launch {
                    val mat = prefs.observeMatInfo().first() ?: return@launch
                    val currentMatch = match ?: return@launch
                    navigator.goTo(ShowCodesScreen(mat = mat, match = currentMatch))
                }
                MasterSessionEvent.ReturnToMain -> exitSignal.requestExitToMain()
            }
        }
    }

    @[AssistedFactory CircuitInject(MasterSessionScreen::class, MatchScope::class)]
    fun interface Factory {
        fun create(screen: MasterSessionScreen, navigator: Navigator): MasterSessionPresenter
    }
}

// TODO: move to domain layer if reused by other screens
private fun scoreForCompetitor(match: Match, competitorId: UserId): Int {
    return match.rounds.sumOf { round -> round.score[competitorId] ?: 0 }
}
