package dev.jvmname.accord.domain.session

import dev.jvmname.accord.domain.Competitor
import dev.jvmname.accord.domain.control.ButtonEvent
import dev.jvmname.accord.domain.control.RoundAudioFeedbackHelper
import dev.jvmname.accord.domain.control.ScoreHapticFeedbackHelper
import dev.jvmname.accord.domain.control.rounds.MatchConfig
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals

@OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)
class SoloMatchSessionScoreTest {

    private fun createSession(
        tracker: FakeButtonPressTracker,
        timer: FakeTimer,
        testScope: kotlinx.coroutines.CoroutineScope,
    ): SoloMatchSession {
        val fakeFactory = ScoreHapticFeedbackHelper.Factory { buttonEvents, score ->
            ScoreHapticFeedbackHelper(buttonEvents, score, testScope)
        }
        val fakeAudioFactory = RoundAudioFeedbackHelper.Factory { roundEvent ->
            RoundAudioFeedbackHelper(roundEvent, testScope)
        }
        return SoloMatchSession(tracker, timer, testScope, MatchConfig.RdojoKombat, fakeFactory, fakeAudioFactory)
    }

    @Test
    fun `3 RED holding ticks yields 1 red point`() = runTest {
        val tracker = FakeButtonPressTracker()
        val timer = FakeTimer()
        val session = createSession(tracker, timer, backgroundScope)

        session.startRound()
        advanceUntilIdle()

        repeat(3) { tracker.emit(ButtonEvent.Holding(Competitor.Orange)) }
        advanceUntilIdle()

        assertEquals(1, session.score.value.redPoints)
        assertEquals(0, session.score.value.bluePoints)
    }

    @Test
    fun `2 RED holding ticks yields 0 red points (below threshold)`() = runTest {
        val tracker = FakeButtonPressTracker()
        val timer = FakeTimer()
        val session = createSession(tracker, timer, backgroundScope)

        session.startRound()
        advanceUntilIdle()

        repeat(2) { tracker.emit(ButtonEvent.Holding(Competitor.Orange)) }
        advanceUntilIdle()

        assertEquals(0, session.score.value.redPoints)
        assertEquals(0, session.score.value.bluePoints)
    }

    @Test
    fun `9 RED holding ticks yields 3 red points`() = runTest {
        val tracker = FakeButtonPressTracker()
        val timer = FakeTimer()
        val session = createSession(tracker, timer, backgroundScope)

        session.startRound()
        advanceUntilIdle()

        repeat(9) { tracker.emit(ButtonEvent.Holding(Competitor.Orange)) }
        advanceUntilIdle()

        assertEquals(3, session.score.value.redPoints)
        assertEquals(0, session.score.value.bluePoints)
    }

    @Test
    fun `red holds 3 ticks then blue holds 6 ticks yields 1 red point and 2 blue points`() = runTest {
        val tracker = FakeButtonPressTracker()
        val timer = FakeTimer()
        val session = createSession(tracker, timer, backgroundScope)

        session.startRound()
        advanceUntilIdle()

        // Red holds 3 ticks (1 point), then releases to reset activeControlTime
        repeat(3) { tracker.emit(ButtonEvent.Holding(Competitor.Orange)) }
        advanceUntilIdle()
        tracker.emit(ButtonEvent.Release(Competitor.Orange))
        advanceUntilIdle()

        // Blue holds 6 ticks (2 points), accumulating from a fresh session
        repeat(6) { tracker.emit(ButtonEvent.Holding(Competitor.Green)) }
        advanceUntilIdle()

        assertEquals(1, session.score.value.redPoints)
        assertEquals(2, session.score.value.bluePoints)
    }

    @Test
    fun `72 RED holding ticks triggers tech fall win for RED (round 1 maxPoints=24)`() = runTest {
        val tracker = FakeButtonPressTracker()
        val timer = FakeTimer()
        val session = createSession(tracker, timer, backgroundScope)

        session.startRound()
        advanceUntilIdle()

        // 72 ticks = 72 seconds = 24 points (72 / 3 = 24 = maxPoints for round 1)
        repeat(72) { tracker.emit(ButtonEvent.Holding(Competitor.Orange)) }
        advanceUntilIdle()

        assertEquals(Competitor.Orange, session.score.value.techFallWin)
    }

    @Test
    fun `72 BLUE holding ticks triggers tech fall win for BLUE (round 1 maxPoints=24)`() = runTest {
        val tracker = FakeButtonPressTracker()
        val timer = FakeTimer()
        val session = createSession(tracker, timer, backgroundScope)

        session.startRound()
        advanceUntilIdle()

        repeat(72) { tracker.emit(ButtonEvent.Holding(Competitor.Green)) }
        advanceUntilIdle()

        assertEquals(Competitor.Green, session.score.value.techFallWin)
    }
}
