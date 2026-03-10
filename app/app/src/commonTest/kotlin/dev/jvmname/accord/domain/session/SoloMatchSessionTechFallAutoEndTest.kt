package dev.jvmname.accord.domain.session

import dev.jvmname.accord.domain.Competitor
import dev.jvmname.accord.domain.control.ButtonEvent
import dev.jvmname.accord.domain.control.ScoreHapticFeedbackHelper
import dev.jvmname.accord.domain.control.rounds.MatchConfig
import dev.jvmname.accord.domain.control.rounds.RoundEvent
import dev.jvmname.accord.domain.control.rounds.RoundInfo
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs

@OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)
class SoloMatchSessionTechFallAutoEndTest {

    private fun createSession(
        tracker: FakeButtonPressTracker,
        timer: FakeTimer,
        testScope: kotlinx.coroutines.CoroutineScope,
    ): SoloMatchSession {
        val fakeFactory = ScoreHapticFeedbackHelper.Factory { buttonEvents, score ->
            ScoreHapticFeedbackHelper(buttonEvents, score, testScope)
        }
        return SoloMatchSession(tracker, timer, testScope, MatchConfig.RdojoKombat, fakeFactory)
    }

    @Test
    fun `tech fall in round 1 auto-ends the round exactly once`() = runTest {
        val tracker = FakeButtonPressTracker()
        val timer = FakeTimer()
        val session = createSession(tracker, timer, backgroundScope)

        val roundStates = mutableListOf<RoundEvent.RoundState?>()
        val collectJob = launch { session.roundEvent.collect { roundStates.add(it?.state) } }

        session.startRound()
        advanceUntilIdle()

        // 72 ticks = 24 points = Round 1 maxPoints → tech fall
        repeat(72) { tracker.emit(ButtonEvent.Holding(Competitor.RED)) }
        advanceUntilIdle()

        val endedCount = roundStates.count { it == RoundEvent.RoundState.ENDED }
        assertEquals(1, endedCount, "Round should have ended exactly once via tech fall")

        collectJob.cancel()
    }

    @Test
    fun `tech fall in round 2 auto-ends round 2 exactly once`() = runTest {
        val tracker = FakeButtonPressTracker()
        val timer = FakeTimer()
        val session = createSession(tracker, timer, backgroundScope)

        // Advance to Round 2 manually
        session.startRound()  // Round 1 STARTED
        advanceUntilIdle()
        session.endRound()    // Round 1 ENDED
        advanceUntilIdle()
        session.startRound()  // Break 1 STARTED
        advanceUntilIdle()
        session.endRound()    // Break 1 ENDED
        advanceUntilIdle()
        session.startRound()  // Round 2 STARTED (score resets here)
        advanceUntilIdle()

        assertEquals(2, session.roundEvent.value?.roundNumber)
        assertIs<RoundInfo.Round>(session.roundEvent.value?.round)

        val roundStates = mutableListOf<RoundEvent.RoundState?>()
        val collectJob = launch { session.roundEvent.collect { roundStates.add(it?.state) } }

        // 48 ticks = 48 seconds = 16 points = Round 2 maxPoints → tech fall
        repeat(48) { tracker.emit(ButtonEvent.Holding(Competitor.RED)) }
        advanceUntilIdle()

        val endedCount = roundStates.count { it == RoundEvent.RoundState.ENDED }
        assertEquals(1, endedCount, "Round 2 should have ended exactly once via tech fall")

        collectJob.cancel()
    }

    @Test
    fun `multiple rapid tech fall score emissions end the round only once`() = runTest {
        val tracker = FakeButtonPressTracker()
        val timer = FakeTimer()
        val session = createSession(tracker, timer, backgroundScope)

        val roundStates = mutableListOf<RoundEvent.RoundState?>()
        val collectJob = launch { session.roundEvent.collect { roundStates.add(it?.state) } }

        session.startRound()
        advanceUntilIdle()

        // Emit well past the tech fall threshold to trigger multiple score updates above threshold
        repeat(90) { tracker.emit(ButtonEvent.Holding(Competitor.RED)) }
        advanceUntilIdle()

        // The auto-end mechanism uses runningFold tracking prev==null && current!=null,
        // so it fires exactly once regardless of how many score updates exceed the threshold
        val endedCount = roundStates.count { it == RoundEvent.RoundState.ENDED }
        assertEquals(1, endedCount, "Round should have ended exactly once even with many ticks past threshold")

        collectJob.cancel()
    }

    @Test
    fun `manual endRound does not cause spurious auto-end on next round start`() = runTest {
        val tracker = FakeButtonPressTracker()
        val timer = FakeTimer()
        val session = createSession(tracker, timer, backgroundScope)

        session.startRound()
        advanceUntilIdle()

        // Accumulate some points (not enough for tech fall)
        repeat(6) { tracker.emit(ButtonEvent.Holding(Competitor.RED)) }
        advanceUntilIdle()
        assertEquals(2, session.score.value.redPoints)

        // Manually end round — no tech fall win set
        session.endRound()
        advanceUntilIdle()

        // Move to Break then start Round 2 (score resets on Round STARTED after Break ENDED)
        session.startRound()  // Break 1 STARTED
        advanceUntilIdle()
        session.endRound()    // Break 1 ENDED
        advanceUntilIdle()

        val roundStates = mutableListOf<RoundEvent.RoundState?>()
        val collectJob = launch { session.roundEvent.collect { roundStates.add(it?.state) } }

        session.startRound()  // Round 2 STARTED — score resets to 0, techFallWin = null
        advanceUntilIdle()

        // No ENDED should have fired for round 2 spuriously
        val endedCount = roundStates.count { it == RoundEvent.RoundState.ENDED }
        assertEquals(0, endedCount, "No spurious auto-end should fire after score reset on new round start")
        assertEquals(RoundEvent.RoundState.STARTED, session.roundEvent.value?.state)

        collectJob.cancel()
    }
}
