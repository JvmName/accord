package dev.jvmname.accord.ui.ride_time

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import com.slack.circuit.codegen.annotations.CircuitInject
import com.slack.circuit.runtime.Navigator
import com.slack.circuit.runtime.presenter.Presenter
import dev.jvmname.accord.domain.ButtonPressTracker
import dev.jvmname.accord.domain.Competitor
import dev.jvmname.accord.prefs.Prefs
import dev.zacsweers.metro.AppScope
import dev.zacsweers.metro.Assisted
import dev.zacsweers.metro.AssistedFactory
import dev.zacsweers.metro.AssistedInject
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.first
import kotlin.time.Duration


@AssistedInject
class RideTimePresenter(
    @Assisted private val screen: RideTimeScreen,
    @Assisted private val navigator: Navigator,
    private val soloFactory: SoloRideTimePresenter.Factory
) : Presenter<RideTimeState> {
    @Composable
    override fun present(): RideTimeState {
        val delegate: Presenter<RideTimeState> = remember(screen, navigator) {
            when (screen.type) {
                RideTimeType.SOLO -> soloFactory.create(screen, navigator)
                RideTimeType.CONSENSUS -> TODO()
            }
        }

        return delegate.present()
    }


    @[AssistedFactory CircuitInject(RideTimeScreen::class, AppScope::class)]
    fun interface Factory {
        fun create(screen: RideTimeScreen, navigator: Navigator): SoloRideTimePresenter
    }
}


@AssistedInject
class SoloRideTimePresenter(
    @Assisted private val screen: RideTimeScreen,
    @Assisted private val navigator: Navigator,
    private val prefs: Prefs,
    private val buttonPressTracker: ButtonPressTracker,
) : Presenter<RideTimeState> {

    @Composable
    override fun present(): RideTimeState {
        val matName by produceState("") {
            value = prefs.observeMatInfo().filterNotNull().first().name
        }

        val redTime by buttonPressTracker.rememberCompetitorTime(Competitor.RED)
        val blueTime by buttonPressTracker.rememberCompetitorTime(Competitor.BLUE)



        var active: Competitor? by remember { mutableStateOf(null) }

        return RideTimeState(
            matName = matName,
            activeRidingCompetitor = active,
            redTime = formatTime(redTime),
            blueTime = formatTime(blueTime),
            eventSink = {
                when (it) {
                    RideTimeEvent.Back -> navigator.pop()
                    is RideTimeEvent.ButtonPress -> {
                        active = it.competitor
                        buttonPressTracker.recordPress(it.competitor)
                    }

                    is RideTimeEvent.ButtonRelease -> {
                        active = null
                        buttonPressTracker.recordRelease()
                    }
                }
            }
        )
    }

    private fun formatTime(duration: Duration): String {
        val seconds = duration.inWholeMilliseconds * 1000
        val minutes = seconds / 60
        val remainingSeconds = seconds % 60
        return "%01d:%02d".format(minutes, remainingSeconds)
    }


    @[AssistedFactory]
    fun interface Factory {
        fun create(screen: RideTimeScreen, navigator: Navigator): SoloRideTimePresenter
    }
}