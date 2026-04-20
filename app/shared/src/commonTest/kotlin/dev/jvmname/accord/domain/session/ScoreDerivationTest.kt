package dev.jvmname.accord.domain.session

import dev.jvmname.accord.domain.Competitor
import dev.jvmname.accord.network.MatId
import dev.jvmname.accord.network.Match
import dev.jvmname.accord.network.MatchId
import dev.jvmname.accord.network.Round
import dev.jvmname.accord.network.RoundId
import dev.jvmname.accord.network.RoundResult
import dev.jvmname.accord.network.RoundResultMethod
import dev.jvmname.accord.network.User
import dev.jvmname.accord.network.UserId
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.time.Instant

class ScoreDerivationTest {

    private val redUser = User(UserId("red1"), "Red")
    private val blueUser = User(UserId("blue1"), "Blue")

    private fun makeMatch(rounds: List<Round> = emptyList()) = Match(
        id = MatchId("match1"),
        creatorId = UserId("creator1"),
        matId = MatId("mat1"),
        startedAt = Instant.fromEpochSeconds(0),
        endedAt = null,
        red = redUser,
        blue = blueUser,
        rounds = rounds,
    )

    private fun makeRound(
        score: Map<UserId, Int> = emptyMap(),
        endedAt: Instant? = null,
        result: RoundResult = RoundResult(winner = null, method = RoundResultMethod(null, null)),
    ) = Round(
        id = RoundId("r1"),
        maxDuration = 180,
        startedAt = Instant.fromEpochSeconds(0),
        endedAt = endedAt,
        score = score,
        result = result,
    )

    @Test
    fun `score map has both competitors`() {
        val round = makeRound(score = mapOf(UserId("red1") to 30, UserId("blue1") to 20))
        val match = makeMatch(rounds = listOf(round))
        val score = deriveScoreFromMatch(match)
        assertEquals(30, score.redPoints)
        assertEquals(20, score.bluePoints)
    }

    @Test
    fun `score map missing red key defaults to zero`() {
        val round = makeRound(score = mapOf(UserId("blue1") to 15))
        val match = makeMatch(rounds = listOf(round))
        val score = deriveScoreFromMatch(match)
        assertEquals(0, score.redPoints)
        assertEquals(15, score.bluePoints)
    }

    @Test
    fun `score map missing blue key defaults to zero`() {
        val round = makeRound(score = mapOf(UserId("red1") to 10))
        val match = makeMatch(rounds = listOf(round))
        val score = deriveScoreFromMatch(match)
        assertEquals(10, score.redPoints)
        assertEquals(0, score.bluePoints)
    }

    @Test
    fun `empty score map gives zero for both competitors`() {
        val round = makeRound(score = emptyMap())
        val match = makeMatch(rounds = listOf(round))
        val score = deriveScoreFromMatch(match)
        assertEquals(0, score.redPoints)
        assertEquals(0, score.bluePoints)
    }

    @Test
    fun `round result winner is red gives techFallWin RED`() {
        val result = RoundResult(winner = redUser, method = RoundResultMethod(null, null))
        val round = makeRound(result = result)
        val match = makeMatch(rounds = listOf(round))
        val score = deriveScoreFromMatch(match)
        assertEquals(Competitor.Orange, score.techFallWin)
    }

    @Test
    fun `round result winner is blue gives techFallWin BLUE`() {
        val result = RoundResult(winner = blueUser, method = RoundResultMethod(null, null))
        val round = makeRound(result = result)
        val match = makeMatch(rounds = listOf(round))
        val score = deriveScoreFromMatch(match)
        assertEquals(Competitor.Green, score.techFallWin)
    }

    @Test
    fun `round result winner is null gives techFallWin null`() {
        val result = RoundResult(winner = null, method = RoundResultMethod(null, null))
        val round = makeRound(result = result)
        val match = makeMatch(rounds = listOf(round))
        val score = deriveScoreFromMatch(match)
        assertNull(score.techFallWin)
    }

    @Test
    fun `no active round gives zeros and null techFallWin`() {
        val endedRound = makeRound(
            score = mapOf(UserId("red1") to 45, UserId("blue1") to 10),
            endedAt = Instant.fromEpochSeconds(180),
            result = RoundResult(winner = redUser, method = RoundResultMethod(null, null)),
        )
        val match = makeMatch(rounds = listOf(endedRound))
        val score = deriveScoreFromMatch(match)
        assertEquals(0, score.redPoints)
        assertEquals(0, score.bluePoints)
        assertNull(score.techFallWin)
    }
}
