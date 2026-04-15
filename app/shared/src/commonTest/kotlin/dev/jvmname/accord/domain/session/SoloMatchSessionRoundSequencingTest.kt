package dev.jvmname.accord.domain.session

import dev.jvmname.accord.domain.Competitor
import dev.jvmname.accord.domain.control.ButtonEvent
import dev.jvmname.accord.domain.control.RoundAudioFeedbackHelper
import dev.jvmname.accord.domain.control.ScoreHapticFeedbackHelper
import dev.jvmname.accord.domain.control.rounds.MatchConfig
import dev.jvmname.accord.domain.control.rounds.RoundEvent
import dev.jvmname.accord.domain.control.rounds.RoundInfo
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertNotNull
import kotlin.test.assertNull

@OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)
class SoloMatchSessionRoundSequencingTest {

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
    fun `initial round event is null`() = runTest {
        val tracker = FakeButtonPressTracker()
        val timer = FakeTimer()
        val session = createSession(tracker, timer, backgroundScope)

        assertNull(session.roundEvent.value)
    }

    @Test
    fun `after startRound round 1 is STARTED`() = runTest {
        val tracker = FakeButtonPressTracker()
        val timer = FakeTimer()
        val session = createSession(tracker, timer, backgroundScope)

        session.startRound()
        advanceUntilIdle()

        val event = session.roundEvent.value
        assertNotNull(event)
        assertEquals(RoundEvent.RoundState.STARTED, event.state)
        assertEquals(1, event.roundNumber)
        assertIs<RoundInfo.Round>(event.round)
    }

    @Test
    fun `after endRound event state is ENDED`() = runTest {
        val tracker = FakeButtonPressTracker()
        val timer = FakeTimer()
        val session = createSession(tracker, timer, backgroundScope)

        session.startRound()
        advanceUntilIdle()
        session.endRound()
        advanceUntilIdle()

        assertEquals(RoundEvent.RoundState.ENDED, session.roundEvent.value?.state)
    }

    @Test
    fun `calling startRound when a round exists advances to Break`() = runTest {
        val tracker = FakeButtonPressTracker()
        val timer = FakeTimer()
        val session = createSession(tracker, timer, backgroundScope)

        // Start round 1
        session.startRound()
        advanceUntilIdle()
        // Call startRound again: nextRound() advances overallIndex to 1 (Break), then STARTED
        session.startRound()
        advanceUntilIdle()

        val event = session.roundEvent.value
        assertNotNull(event)
        assertEquals(RoundEvent.RoundState.STARTED, event.state)
        assertIs<RoundInfo.Break>(event.round)
        // roundNumber stays at 1 during a break
        assertEquals(1, event.roundNumber)
    }

    @Test
    fun `full happy path through all rounds ends in MATCH_ENDED`() = runTest {
        val tracker = FakeButtonPressTracker()
        val timer = FakeTimer()
        val session = createSession(tracker, timer, backgroundScope)

        // Round 1 STARTED
        session.startRound()
        advanceUntilIdle()
        assertEquals(RoundEvent.RoundState.STARTED, session.roundEvent.value?.state)
        assertEquals(1, session.roundEvent.value?.roundNumber)
        assertIs<RoundInfo.Round>(session.roundEvent.value?.round)

        // Round 1 ENDED
        session.endRound()
        advanceUntilIdle()
        assertEquals(RoundEvent.RoundState.ENDED, session.roundEvent.value?.state)

        // Break 1 STARTED (startRound calls nextRound first, overallIndex→1=Break)
        session.startRound()
        advanceUntilIdle()
        assertIs<RoundInfo.Break>(session.roundEvent.value?.round)
        assertEquals(RoundEvent.RoundState.STARTED, session.roundEvent.value?.state)

        // Break 1 ENDED
        session.endRound()
        advanceUntilIdle()
        assertEquals(RoundEvent.RoundState.ENDED, session.roundEvent.value?.state)

        // Round 2 STARTED (startRound calls nextRound, overallIndex→2=Round, roundNumber→2)
        session.startRound()
        advanceUntilIdle()
        assertEquals(RoundEvent.RoundState.STARTED, session.roundEvent.value?.state)
        assertEquals(2, session.roundEvent.value?.roundNumber)
        assertIs<RoundInfo.Round>(session.roundEvent.value?.round)

        // Round 2 ENDED
        session.endRound()
        advanceUntilIdle()
        assertEquals(RoundEvent.RoundState.ENDED, session.roundEvent.value?.state)

        // Break 2 STARTED
        session.startRound()
        advanceUntilIdle()
        assertIs<RoundInfo.Break>(session.roundEvent.value?.round)
        assertEquals(RoundEvent.RoundState.STARTED, session.roundEvent.value?.state)

        // Break 2 ENDED
        session.endRound()
        advanceUntilIdle()
        assertEquals(RoundEvent.RoundState.ENDED, session.roundEvent.value?.state)

        // Round 3 STARTED
        session.startRound()
        advanceUntilIdle()
        assertEquals(RoundEvent.RoundState.STARTED, session.roundEvent.value?.state)
        assertEquals(3, session.roundEvent.value?.roundNumber)
        assertIs<RoundInfo.Round>(session.roundEvent.value?.round)

        // Round 3 ENDED
        session.endRound()
        advanceUntilIdle()
        assertEquals(RoundEvent.RoundState.ENDED, session.roundEvent.value?.state)

        // Calling startRound when overallIndex exceeds config size → MATCH_ENDED
        session.startRound()
        advanceUntilIdle()
        assertEquals(RoundEvent.RoundState.MATCH_ENDED, session.roundEvent.value?.state)
    }

    @Test
    fun `score resets when round 2 starts after break`() = runTest {
        val tracker = FakeButtonPressTracker()
        val timer = FakeTimer()
        val session = createSession(tracker, timer, backgroundScope)

        // Round 1: accumulate some RED points
        session.startRound()
        advanceUntilIdle()
        repeat(6) { tracker.emit(ButtonEvent.Holding(Competitor.RED)) }
        advanceUntilIdle()
        assertEquals(2, session.score.value.redPoints)

        // End round 1 then go to Break
        session.endRound()
        advanceUntilIdle()
        session.startRound() // starts Break 1
        advanceUntilIdle()

        // Points persist during the break (score only resets on Break ENDED → Round STARTED)
        assertEquals(2, session.score.value.redPoints)

        // End break and start Round 2 → score should reset
        session.endRound()
        advanceUntilIdle()
        session.startRound() // starts Round 2 (previous was Break ENDED)
        advanceUntilIdle()

        assertEquals(0, session.score.value.redPoints)
        assertEquals(0, session.score.value.bluePoints)
        assertEquals(RoundEvent.RoundState.STARTED, session.roundEvent.value?.state)
        assertEquals(2, session.roundEvent.value?.roundNumber)
    }
}
