package dev.jvmname.accord.ui.session.master

import androidx.compose.runtime.*
import co.touchlab.kermit.Logger
import com.slack.circuit.codegen.annotations.CircuitInject
import com.slack.circuit.runtime.Navigator
import com.slack.circuit.runtime.presenter.Presenter
import dev.jvmname.accord.di.MatchExitSignal
import dev.jvmname.accord.di.MatchScope
import dev.jvmname.accord.domain.Competitor
import dev.jvmname.accord.domain.MatManager
import dev.jvmname.accord.domain.MatchManager
import dev.jvmname.accord.domain.control.rounds.RoundEvent
import dev.jvmname.accord.domain.control.rounds.RoundInfo
import dev.jvmname.accord.domain.session.MasterSession
import dev.jvmname.accord.network.*
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
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

@AssistedInject
class MasterSessionPresenter(
    @Assisted private val screen: MasterSessionScreen,
    @Assisted private val navigator: Navigator,
    private val session: MasterSession,
    private val matchManager: MatchManager,
    private val matManager: MatManager,
    private val prefs: Prefs,
    private val exitSignal: MatchExitSignal,
    private val scope: CoroutineScope,
) : Presenter<MasterSessionState> {

    private val log = Logger.withTag("UI/MasterSession")

    @Composable
    override fun present(): MasterSessionState {
        val mat: Mat? by produceState(null) {
            value = prefs.observeMatInfo().filterNotNull().first()
        }
        val currentMatch by remember { matchManager.observeCurrentMatch() }.collectAsState(null)
        val score by remember { session.score }.collectAsState()
        val roundEvent by remember { session.roundEvent }.collectAsState()

        var error by remember { mutableStateOf<String?>(null) }
        var showEndRoundDialog by remember { mutableStateOf(false) }
        var showScoresOverlay by remember { mutableStateOf(false) }

        val isMatchStarted = currentMatch?.startedAt != null
        val matchResult = currentMatch?.endedAt?.let { currentMatch?.toMatchResult() }

        val timerDisplay = roundEvent?.remainingHumanTime() ?: "0:00"
        val roundLabel = when (val round = roundEvent?.round) {
            null -> null
            is RoundInfo.Break -> "Break ${roundEvent!!.roundNumber} of ${roundEvent!!.totalRounds - 1}"
            is RoundInfo.Round -> "Round ${round.index} of ${roundEvent!!.totalRounds}"
        }
        val roundScores = currentMatch?.roundScore() ?: mapOf(Competitor.RED to 0, Competitor.BLUE to 0)

        val roundDisplays = currentMatch?.let { match ->
            match.rounds.mapIndexed { index, round ->
                RoundDisplayInfo(
                    roundNumber = index + 1,
                    isInProgress = round.endedAt == null,
                    winner = match.winner(index),
                    redScore = round.score[match.red.id] ?: 0,
                    blueScore = round.score[match.blue.id] ?: 0,
                )
            }
        } ?: emptyList()

        val matchState = MatchState(
            score = score,
            roundInfo = roundEvent,
            timerDisplay = timerDisplay,
            roundLabel = roundLabel,
            controlDurations = emptyMap(),
            roundScores = roundScores,
        )

        val roundState = roundEvent?.state
        val isActive =
            roundState == RoundEvent.RoundState.STARTED && roundEvent?.round is RoundInfo.Round
        val isPaused = roundState == RoundEvent.RoundState.PAUSED

        val eventSink: (MasterSessionEvent) -> Unit = remember {
            { event ->
                log.i { "event: $event" }
                when (event) {
                    MasterSessionEvent.ShowEndRoundDialog -> showEndRoundDialog = true
                    MasterSessionEvent.DismissEndRoundDialog -> showEndRoundDialog = false
                    MasterSessionEvent.StartMatch -> scope.launch {
                        log.i { "starting match" }
                        session.startMatch()
                            .onEither(
                                success = { /* match updated via flow */ },
                                failure = {
                                    log.w { "error: ${it.message}" }
                                    error = it.message
                                }
                            )
                    }

                    MasterSessionEvent.Pause -> {
                        log.i { "round paused" }
                        session.pause()
                    }

                    MasterSessionEvent.Resume -> {
                        log.i { "round resumed" }
                        session.resume()
                    }

                    is MasterSessionEvent.EndRound -> {
                        log.i { "ending round submission=${event.submission} stoppage=${event.stoppage}" }
                        showEndRoundDialog = false
                        session.endRound(event.submitter ?: event.stopper, event.submission, event.stoppage)
                    }

                    MasterSessionEvent.StartRound -> {
                        log.i { "starting round" }
                        session.startRound()
                    }

                    MasterSessionEvent.EndMatch -> scope.launch {
                        log.i { "ending match" }
                        session.endMatch()
                            .onEither(
                                success = { exitSignal.requestExitToMain() },
                                failure = {
                                    log.w { "error: ${it.message}" }
                                    error = it.message
                                }
                            )
                    }

                    MasterSessionEvent.ShowCodes -> scope.launch {
                        val mat = prefs.observeMatInfo().first() ?: return@launch
                        val match = currentMatch ?: return@launch
                        navigator.goTo(
                            ShowCodesScreen(mat = mat, match = match, judgeCount = mat.judgeCount)
                        )
                    }

                    MasterSessionEvent.ShowScores -> showScoresOverlay = true
                    MasterSessionEvent.DismissScores -> showScoresOverlay = false

                    MasterSessionEvent.ReturnToMain -> exitSignal.requestExitToMain()
                    MasterSessionEvent.Back -> scope.launch {
                        mat?.let {
                            matManager.leaveMat(it.adminCode.code)
                        }
                        navigator.pop()
                    }
                }
            }
        }

        val actions = rememberMatchActions(
            isActive = isActive,
            isPaused = isPaused,
            hasRound = roundEvent != null,
            onPause = { eventSink(MasterSessionEvent.Pause) },
            onResume = { eventSink(MasterSessionEvent.Resume) },
            onStartRound = { eventSink(MasterSessionEvent.StartRound) },
            onEndRound = { eventSink(MasterSessionEvent.ShowEndRoundDialog) },
        )

        return MasterSessionState(
            matName = mat?.name.orEmpty(),
            redName = currentMatch?.red?.name ?: "Red",
            blueName = currentMatch?.blue?.name ?: "Blue",
            matchState = matchState,
            isMatchStarted = isMatchStarted,
            matchResult = matchResult,
            actions = actions,
            showEndRoundDialog = showEndRoundDialog,
            showScoresOverlay = showScoresOverlay,
            roundDisplays = roundDisplays,
            error = error,
            eventSink = eventSink,
        )
    }

    @[AssistedFactory CircuitInject(MasterSessionScreen::class, MatchScope::class)]
    fun interface Factory {
        fun create(screen: MasterSessionScreen, navigator: Navigator): MasterSessionPresenter
    }
}
