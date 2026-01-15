package dev.jvmname.accord.ui.control

import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import co.touchlab.kermit.Logger
import com.slack.circuit.runtime.Navigator
import com.slack.circuit.runtime.presenter.Presenter
import dev.jvmname.accord.domain.MatchManager
import dev.jvmname.accord.domain.control.Score
import dev.jvmname.accord.domain.control.rounds.RoundTracker
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
    private val matchManager: MatchManager,
    private val roundTracker: RoundTracker,
) : Presenter<ControlTimeState> {

    @Composable
    override fun present(): ControlTimeState {

        val matName by produceState("") {
            value = prefs.observeMatInfo().filterNotNull().first().name
        }

        // For consensus mode, we track the match state from the network
        val currentMatch by matchManager.observeCurrentMatch().collectAsState(null)
        val roundEvent by remember { roundTracker.roundEvent }.collectAsState()

        // Get the active round's riding time data
        val activeRound = currentMatch?.rounds?.lastOrNull { it.endedAt == null }
        val redRidingTime = activeRound?.ridingTime?.get(currentMatch?.redCompetitor?.id) ?: 0.0
        val blueRidingTime = activeRound?.ridingTime?.get(currentMatch?.blueCompetitor?.id) ?: 0.0

        // Create a simplified match state for consensus mode
        // We don't track button presses or local scoring - everything comes from the network
        val matchState = MatchState(
            score = Score(
                redPoints = redRidingTime.toInt(),
                bluePoints = blueRidingTime.toInt(),
                activeControlTime = TODO(),
                activeCompetitor = TODO(),
                techFallWin = TODO()
            ),
            haptic = null, // No haptic feedback in consensus mode
            roundInfo = roundEvent,
        )

        return ControlTimeState(
            matName = matName,
            matchState = matchState,
            eventSink = {
                Logger.d { "Received event: $it" }
                when (it) {
                    ControlTimeEvent.Back -> navigator.pop()

                    // Button press/release not used in consensus mode
                    is ControlTimeEvent.ButtonPress -> {
                        Logger.d { "Button press ignored in consensus mode: ${it.competitor}" }
                    }

                    is ControlTimeEvent.ButtonRelease -> {
                        Logger.d { "Button release ignored in consensus mode: ${it.competitor}" }
                    }

                    // Manual point edit not used in consensus mode
                    is ControlTimeEvent.ManualPointEdit -> {
                        Logger.d { "Manual point edit ignored in consensus mode" }
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
