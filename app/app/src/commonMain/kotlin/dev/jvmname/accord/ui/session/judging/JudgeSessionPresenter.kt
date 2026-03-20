package dev.jvmname.accord.ui.session.judging

import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import co.touchlab.kermit.Logger
import com.slack.circuit.codegen.annotations.CircuitInject
import com.slack.circuit.runtime.Navigator
import com.slack.circuit.runtime.presenter.Presenter
import dev.jvmname.accord.di.MatchScope
import dev.jvmname.accord.domain.MatchManager
import dev.jvmname.accord.domain.control.rounds.RoundEvent
import dev.jvmname.accord.domain.control.rounds.RoundInfo
import dev.jvmname.accord.domain.session.JudgingSession
import dev.jvmname.accord.domain.session.RoundController
import dev.jvmname.accord.prefs.Prefs
import dev.jvmname.accord.ui.session.JudgeSessionEvent
import dev.jvmname.accord.ui.session.rememberMatchActions
import dev.zacsweers.metro.Assisted
import dev.zacsweers.metro.AssistedFactory
import dev.zacsweers.metro.AssistedInject
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.first

@AssistedInject
class JudgeSessionPresenter(
    @Assisted private val screen: JudgeSessionScreen,
    @Assisted private val navigator: Navigator,
    private val prefs: Prefs,
    private val session: JudgingSession,
    private val matchManager: MatchManager,
) : Presenter<JudgeSessionState> {
    @Composable
    override fun present(): JudgeSessionState {
        val matName by produceState("") {
            value = prefs.observeMatInfo().filterNotNull().first().name
        }

        val score by remember { session.score }.collectAsState()
        val hapticEvent by remember { session.hapticEvents }.collectAsState(null)
        val roundEvent by remember { session.roundEvent }.collectAsState()

        val currentMatch by remember { matchManager.observeCurrentMatch() }.collectAsState(null)
        val isMatchEnded = currentMatch?.endedAt != null

        val matchState = MatchState(
            score = score,
            roundInfo = roundEvent,
        )

        val roundState = roundEvent?.state
        val isActive = roundState == RoundEvent.RoundState.STARTED && roundEvent?.round is RoundInfo.Round
        val isPaused = roundState == RoundEvent.RoundState.PAUSED

        val eventSink: (JudgeSessionEvent) -> Unit = remember {
            { event ->
            Logger.d { "Received event: $event" }
            when (event) {
                JudgeSessionEvent.Back -> navigator.pop()
                is JudgeSessionEvent.ButtonPress -> {
                    Logger.d { "Presenter press ${event.competitor}" }
                    session.recordPress(event.competitor)
                }

                is JudgeSessionEvent.ButtonRelease -> {
                    Logger.d { "Presenter release ${event.competitor}" }
                    session.recordRelease(event.competitor)
                }

                is JudgeSessionEvent.ManualEdit -> {
                    (session as? RoundController)?.manualEdit(event.competitor, event.action)
                }

                JudgeSessionEvent.StartRound -> {
                    (session as? RoundController)?.let { rc ->
                        rc.endRound()
                        rc.startRound()
                    }
                }

                JudgeSessionEvent.Pause -> {
                    session.pause()
                }

                JudgeSessionEvent.Reset -> TODO()
                JudgeSessionEvent.Resume -> {
                    session.resume()
                }

                is JudgeSessionEvent.EndRound -> {
                    (session as? RoundController)?.endRound()
                }

            }
            }
        }

        val actions = rememberMatchActions(
            isActive = isActive,
            isPaused = isPaused,
            hasRound = roundEvent != null,
            onPause = { eventSink(JudgeSessionEvent.Pause) },
            onResume = { eventSink(JudgeSessionEvent.Resume) },
            onStartRound = { eventSink(JudgeSessionEvent.StartRound) },
            onEndRound = { eventSink(JudgeSessionEvent.EndRound()) },
            onReset = { eventSink(JudgeSessionEvent.Reset) },
        )

        return JudgeSessionState(
            matName = matName,
            matchState = matchState,
            hapticEvent = hapticEvent,
            actions = actions,
            isMatchEnded = isMatchEnded,
            eventSink = eventSink,
        )
    }

    @[AssistedFactory CircuitInject(JudgeSessionScreen::class, MatchScope::class)]
    fun interface Factory {
        operator fun invoke(screen: JudgeSessionScreen, navigator: Navigator): JudgeSessionPresenter
    }
}
