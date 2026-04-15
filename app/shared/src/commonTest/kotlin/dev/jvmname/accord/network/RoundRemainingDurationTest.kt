package dev.jvmname.accord.network

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.time.Duration
import kotlin.time.Duration.Companion.seconds
import kotlin.time.Instant

class RoundRemainingDurationTest {

    private fun makeRound(timeRemaining: Int?) = Round(
        id = RoundId("test"),
        maxDuration = 300,
        startedAt = Instant.fromEpochSeconds(0),
        endedAt = null,
        score = mapOf(UserId("x") to 0),
        timeRemaining = timeRemaining,
        result = RoundResult(null, RoundResultMethod(null, null)),
    )

    @Test
    fun `timeRemaining null returns null`() {
        val round = makeRound(timeRemaining = null)
        assertNull(round.remainingDuration)
    }

    @Test
    fun `timeRemaining zero returns Duration ZERO`() {
        val round = makeRound(timeRemaining = 0)
        assertEquals(Duration.ZERO, round.remainingDuration)
    }

    @Test
    fun `timeRemaining 90 returns 90 seconds`() {
        val round = makeRound(timeRemaining = 90)
        assertEquals(90.seconds, round.remainingDuration)
    }

    @Test
    fun `timeRemaining 1 returns 1 second`() {
        val round = makeRound(timeRemaining = 1)
        assertEquals(1.seconds, round.remainingDuration)
    }
}
