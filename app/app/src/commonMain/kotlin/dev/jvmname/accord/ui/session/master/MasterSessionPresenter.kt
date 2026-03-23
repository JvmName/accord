package dev.jvmname.accord.ui.session.master

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import com.slack.circuit.codegen.annotations.CircuitInject
import com.slack.circuit.runtime.Navigator
import com.slack.circuit.runtime.presenter.Presenter
import dev.jvmname.accord.di.MatchExitSignal
import dev.jvmname.accord.di.MatchScope
import dev.jvmname.accord.domain.MatchManager
import dev.jvmname.accord.domain.control.score.Score
import dev.jvmname.accord.network.Match
import dev.jvmname.accord.network.UserId
import dev.jvmname.accord.network.message
import dev.jvmname.accord.prefs.Prefs
import dev.jvmname.accord.ui.onEither
import dev.jvmname.accord.ui.session.MasterSessionEvent
import dev.jvmname.accord.ui.session.MatchState
import dev.jvmname.accord.ui.session.rememberMatchActions
import dev.jvmname.accord.ui.showcodes.ShowCodesScreen
import dev.zacsweers.metro.Assisted
import dev.zacsweers.metro.AssistedFactory
import dev.zacsweers.metro.AssistedInject
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.filterNotNull
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
        val matName by produceState("") {
            value = prefs.observeMatInfo().filterNotNull().first().name
        }
        val match by remember { matchManager.observeCurrentMatch() }.collectAsState(null)
        var error by remember { mutableStateOf<String?>(null) }
        var elapsedSeconds by remember { mutableLongStateOf(0L) }
        var isPaused by remember { mutableStateOf(false) }
        var showEndRoundDialog by remember { mutableStateOf(false) }
        // Note: isPaused is managed as local optimistic state — the server Round model does not
        // expose pause state, so we toggle it on button press and let Pause/Resume
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

        val score = Score(
            redPoints = match?.let { scoreForCompetitor(it, it.red.id) } ?: 0,
            bluePoints = match?.let { scoreForCompetitor(it, it.blue.id) } ?: 0,
            activeControlTime = null,
            activeCompetitor = null,
            techFallWin = null,
        )
        val roundNumber = match?.rounds?.size ?: 0
        val timerDisplay = "%02d:%02d".format(elapsedSeconds / 60, elapsedSeconds % 60)
        val roundLabel = if (roundNumber > 0) "Round $roundNumber" else null
        val matchState = MatchState(
            score = score,
            roundInfo = null,
            timerDisplay = timerDisplay,
            roundLabel = roundLabel,
            showPointControls = false,
            controlDurations = emptyMap(),
        )

        val isSessionActive = isMatchStarted && !isMatchEnded && !isPaused

        val eventSink: (MasterSessionEvent) -> Unit = remember {
            { event ->
            when (event) {
                MasterSessionEvent.ShowEndRoundDialog -> showEndRoundDialog = true
                MasterSessionEvent.DismissEndRoundDialog -> showEndRoundDialog = false
                MasterSessionEvent.StartMatch -> scope.launch {
                    matchManager.startMatch()
                        .onEither(
                            success = { /* match updated via flow */ },
                            failure = { error = it.message }
                        )
                }
                MasterSessionEvent.Pause -> {
                    isPaused = true
                    scope.launch {
                        matchManager.pauseRound(screen.matchId)
                            .onEither(
                                success = { /* match updated via flow */ },
                                failure = { error = it.message }
                            )
                    }
                }
                MasterSessionEvent.Resume -> {
                    isPaused = false
                    scope.launch {
                        matchManager.resumeRound(screen.matchId)
                            .onEither(
                                success = { /* match updated via flow */ },
                                failure = { error = it.message }
                            )
                    }
                }
                is MasterSessionEvent.EndRound -> {
                    showEndRoundDialog = false
                    scope.launch {
                        matchManager.endRound(screen.matchId, event.submission, event.submitter)
                            .onEither(
                                success = { /* match updated via flow */ },
                                failure = { error = it.message }
                            )
                    }
                }
                MasterSessionEvent.StartRound -> scope.launch {
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
                MasterSessionEvent.Back -> navigator.pop()
            }
            }
        }

        val actions = rememberMatchActions(
            isActive = isSessionActive,
            isPaused = isPaused,
            hasRound = roundNumber > 0,
            onPause = { eventSink(MasterSessionEvent.Pause) },
            onResume = { eventSink(MasterSessionEvent.Resume) },
            onStartRound = { eventSink(MasterSessionEvent.StartRound) },
            onEndRound = { eventSink(MasterSessionEvent.ShowEndRoundDialog) },
        )

        return MasterSessionState(
            matName = matName,
            redName = match?.red?.name ?: "Red",
            blueName = match?.blue?.name ?: "Blue",
            matchState = matchState,
            isMatchStarted = isMatchStarted,
            isMatchEnded = isMatchEnded,
            actions = actions,
            showEndRoundDialog = showEndRoundDialog,
            error = error,
            eventSink = eventSink,
        )
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
