package dev.jvmname.accord.ui.control

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
import dev.jvmname.accord.domain.session.JudgingSession
import dev.jvmname.accord.domain.session.RoundController
import dev.jvmname.accord.prefs.Prefs
import dev.zacsweers.metro.Assisted
import dev.zacsweers.metro.AssistedFactory
import dev.zacsweers.metro.AssistedInject
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.first

@AssistedInject
class ControlTimePresenter(
    @Assisted private val screen: ControlTimeScreen,
    @Assisted private val navigator: Navigator,
    private val prefs: Prefs,
    private val session: JudgingSession,
    private val matchManager: MatchManager,
) : Presenter<ControlTimeState> {
    @Composable
    override fun present(): ControlTimeState {
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
            haptic = hapticEvent,
            roundInfo = roundEvent,
        )

        return ControlTimeState(
            matName = matName,
            matchState = matchState,
            isMatchEnded = isMatchEnded,
            eventSink = { event ->
                Logger.d { "Received event: $event" }
                when (event) {
                    ControlTimeEvent.Back -> navigator.pop()
                    is ControlTimeEvent.ButtonPress -> {
                        Logger.d { "Presenter press ${event.competitor}" }
                        session.recordPress(event.competitor)
                    }

                    is ControlTimeEvent.ButtonRelease -> {
                        Logger.d { "Presenter release ${event.competitor}" }
                        session.recordRelease(event.competitor)
                    }

                    is ControlTimeEvent.ManualPointEdit -> {
                        (session as? RoundController)?.manualEdit(event.competitor, event.action)
                    }

                    ControlTimeEvent.BeginNextRound -> {
                        (session as? RoundController)?.let { rc ->
                            rc.endRound()
                            rc.startRound()
                        }
                    }

                    ControlTimeEvent.Pause -> {
                        session.pause()
                    }

                    ControlTimeEvent.Reset -> TODO()
                    ControlTimeEvent.Resume -> {
                        session.resume()
                    }

                    ControlTimeEvent.Submission -> {
                        (session as? RoundController)?.endRound()
                    }

                }
            }
        )
    }

    @[AssistedFactory CircuitInject(ControlTimeScreen::class, MatchScope::class)]
    fun interface Factory {
        operator fun invoke(screen: ControlTimeScreen, navigator: Navigator): ControlTimePresenter
    }
}
