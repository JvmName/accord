package dev.jvmname.accord.domain.control.rounds

import dev.drewhamilton.poko.Poko
import dev.jvmname.accord.domain.control.rounds.RoundInfo.Break
import dev.jvmname.accord.domain.control.rounds.RoundInfo.Round
import kotlinx.coroutines.flow.StateFlow
import kotlin.time.Duration
import kotlin.time.Duration.Companion.minutes

/**
 * Interface for tracking rounds in a match.
 * Implementations can be local (solo) or network-based (consensus).
 */
interface RoundTracker {
    /**
     * Observable state of the current round.
     */
    val roundEvent: StateFlow<RoundEvent?>

    /**
     * Start the next round. For the first call, starts the first round.
     * For subsequent calls, ends the current round and starts the next one.
     */
    fun startRound()

    /**
     * Pause the current round timer.
     */
    fun pause()

    /**
     * Resume the paused round timer.
     */
    fun resume()

    /**
     * End the current round.
     */
    fun endRound()
}

data class MatchConfig(val rounds: List<RoundInfo>) {
    operator fun get(index: Int): RoundInfo = rounds[index]
    fun getRound(roundIndex: Int): Round? = rounds.firstNotNullOfOrNull { br ->
        (br as? Round)?.takeIf { it.index == roundIndex }
    }

    companion object Companion {
        val RdojoKombat = MatchConfig(
            listOf(
                Round(
                    index = 1,
                    duration = 3.minutes,
                    maxPoints = 24,
                ),
                Break(1.minutes),
                Round(
                    index = 2,
                    maxPoints = 16,
                    duration = 2.minutes
                ),
                Break(1.minutes),
                Round(
                    index = 3,
                    maxPoints = 8,
                    duration = 1.minutes,
                    optional = true
                ),
            )
        )


    }
}

sealed interface RoundInfo {
    val duration: Duration

    @Poko
    class Round(
        val index: Int,
        val maxPoints: Int,
        override val duration: Duration,
        val optional: Boolean = false,
    ) : RoundInfo

    @Poko
    class Break(override val duration: Duration) : RoundInfo
}

data class RoundEvent(
    val remaining: Duration,
    val roundNumber: Int,
    val totalRounds: Int,
    val round: RoundInfo,
    val state: RoundState,
) {
    enum class RoundState {
        STARTED, PAUSED, ENDED, MATCH_ENDED
    }

    fun remainingHumanTime(): String {
        val minutes = remaining.inWholeMinutes
        val seconds = remaining.inWholeSeconds % 60
        return "$minutes:${seconds.toString().padStart(2, '0')}"
    }
}