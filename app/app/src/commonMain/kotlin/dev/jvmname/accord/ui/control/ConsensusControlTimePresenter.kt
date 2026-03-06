package dev.jvmname.accord.ui.control

import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import co.touchlab.kermit.Logger
import com.slack.circuit.runtime.Navigator
import com.slack.circuit.runtime.presenter.Presenter
import dev.jvmname.accord.domain.control.ButtonPressTracker
import dev.jvmname.accord.domain.control.ScoreHapticFeedbackHelper
import dev.jvmname.accord.domain.control.rounds.RoundTracker
import dev.jvmname.accord.domain.control.score.ScoreKeeper
import dev.jvmname.accord.prefs.Prefs
import dev.zacsweers.metro.Assisted
import dev.zacsweers.metro.AssistedFactory
import dev.zacsweers.metro.AssistedInject
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.first

/**
 * Presenter for consensus (network-based) control time.
 * This presenter works with the network API and syncs state across multiple judges.
 */
@AssistedInject
class ConsensusControlTimePresenter(
    @Suppress("unused")
    @Assisted private val screen: ControlTimeScreen,
    @Assisted private val navigator: Navigator,
    private val prefs: Prefs,
    private val buttonTracker: ButtonPressTracker,
    private val scoreKeeper: ScoreKeeper,
    private val hapticFeedbackHelper: ScoreHapticFeedbackHelper,
    private val roundTracker: RoundTracker,
) : Presenter<ControlTimeState> {

    @Composable
    override fun present(): ControlTimeState {
        val matName by produceState("") {
            value = prefs.observeMatInfo().filterNotNull().first().name
        }

        val score by remember { scoreKeeper.score }.collectAsState()
        val hapticEvent by remember { hapticFeedbackHelper.hapticEvents }.collectAsState(null)
        val roundEvent by remember { roundTracker.roundEvent }.collectAsState()

        val matchState = MatchState(
            score = score,
            haptic = hapticEvent,
            roundInfo = roundEvent,
        )

        return ControlTimeState(
            matName = matName,
            matchState = matchState,
            eventSink = {
                Logger.d { "Received event: $it" }
                when (it) {
                    ControlTimeEvent.Back -> navigator.pop()

                    is ControlTimeEvent.ButtonPress -> {
                        Logger.d { "Presenter press ${it.competitor}" }
                        buttonTracker.recordPress(it.competitor)
                    }

                    is ControlTimeEvent.ButtonRelease -> {
                        Logger.d { "Presenter release ${it.competitor}" }
                        buttonTracker.recordRelease(it.competitor)
                    }

                    is ControlTimeEvent.ManualPointEdit -> {
                        scoreKeeper.manualEdit(it.competitor, it.action)
                    }

                    ControlTimeEvent.BeginNextRound -> {
                        roundTracker.endRound()
                        roundTracker.startRound()
                    }

                    ControlTimeEvent.Pause -> {
                        roundTracker.pause()
                    }

                    ControlTimeEvent.Reset -> {
                        Logger.d { "Reset not implemented in consensus mode" }
                    }

                    ControlTimeEvent.Resume -> {
                        roundTracker.resume()
                    }

                    ControlTimeEvent.Submission -> {
                        roundTracker.endRound()
                    }
                }
            }
        )
    }

    @AssistedFactory
    fun interface Factory {
        fun create(screen: ControlTimeScreen, navigator: Navigator): ConsensusControlTimePresenter
    }
}
