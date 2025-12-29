package dev.jvmname.accord.domain

import dev.zacsweers.metro.Inject
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.filterIsInstance
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.flow.update
import kotlin.time.Duration
import kotlin.time.Duration.Companion.seconds

@Inject
class ScoreKeeper(
    tracker: ButtonPressTracker,
    scope: CoroutineScope
) {

    private val _score = MutableStateFlow(TimeScore(Duration.ZERO, Duration.ZERO))
    val score: StateFlow<TimeScore>
        get() = _score.asStateFlow()

    companion object {
        private val OneSecond = 1.seconds
    }

    init {
        tracker.buttonEvents
            .filterIsInstance<ButtonEvent.Holding>()
            .onEach { new ->
                _score.update { prev ->
                    prev.copy(
                        redTime = if (new.competitor == Competitor.RED) prev.redTime + OneSecond else prev.redTime,
                        blueTime = if (new.competitor == Competitor.BLUE) prev.blueTime + OneSecond else prev.blueTime,
                    )
                }
            }
            .launchIn(scope)
    }
}

data class TimeScore(val redTime: Duration, val blueTime: Duration)