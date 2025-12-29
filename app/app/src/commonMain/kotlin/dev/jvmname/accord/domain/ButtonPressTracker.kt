package dev.jvmname.accord.domain

import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.waitForUpOrCancellation
import androidx.compose.runtime.Composable
import androidx.compose.runtime.State
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.pointerInput
import dev.zacsweers.metro.Inject
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlin.concurrent.atomics.AtomicReference
import kotlin.concurrent.atomics.update
import kotlin.time.Clock
import kotlin.time.Duration
import kotlin.time.Duration.Companion.nanoseconds
import kotlin.time.Duration.Companion.seconds

@Inject
class ButtonPressTracker(
    private val coroutineScope: CoroutineScope,
    private val clock: Clock
) {
    private val redTime = MutableStateFlow(Duration.ZERO)
    private val blueTime = MutableStateFlow(Duration.ZERO)
    private val tracking = AtomicReference<Job?>(null)

    @Composable
    fun rememberCompetitorTime(competitor: Competitor): State<Duration> {
        return remember(competitor) {
            when (competitor) {
                Competitor.RED -> redTime
                Competitor.BLUE -> blueTime
            }
        }.collectAsState()
    }

    fun recordPress(competitor: Competitor) {
        val newTracking = coroutineScope.launch(
            context = Dispatchers.Default,
            start = CoroutineStart.LAZY
        ) {
            ticker(1.seconds) {
                when (competitor) {
                    Competitor.RED -> redTime.update { it + 1.seconds }
                    Competitor.BLUE -> blueTime.update { it + 1.seconds }
                }
            }
        }
        if (tracking.compareAndSet(null, newTracking)) {
            newTracking.start()
        }
    }

    fun recordRelease() {
        tracking.update {
            it?.cancel()
            null
        }
    }

    private suspend fun ticker(updateFrequency: Duration, block: () -> Unit) {
        //borrowed from https://androidstudygroup.slack.com/archives/CJH03QASH/p1755194498759219?thread_ts=1755118236.503209&cid=CJH03QASH
        val currentTime = clock.now()
        val rightOnTheDot = currentTime - currentTime.nanosecondsOfSecond.nanoseconds
        val delayTime = (rightOnTheDot + updateFrequency) - currentTime

//        println("---")
//        println("Current: $currentTime")
//        println("Extra nanos: $extraNanos")
//        println("Right on: $rightOnTheDot")
//        println("Next tick: $nextTick")
//        println("Delay duration: $delayTime")
//        println("---")

        block()
        delay(delayTime)
    }

}

fun Modifier.buttonHold(
    onPress: () -> Unit,
    onRelease: () -> Unit
): Modifier =
    pointerInput(onPress, onRelease) {
        awaitEachGesture {
            awaitFirstDown()
                .also {
                    onPress()
                    it.consume()
                }
            waitForUpOrCancellation()
                ?.also {
                    onRelease()
                    it.consume()
                }
        }
    }
