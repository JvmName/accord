package dev.jvmname.accord.ui.session

import dev.drewhamilton.poko.Poko
import dev.jvmname.accord.domain.Competitor
import dev.jvmname.accord.domain.control.AudioEvent
import dev.jvmname.accord.domain.control.rounds.RoundEvent
import dev.jvmname.accord.domain.control.score.Score

@Poko
class MatchState(
    val score: Score,
    val roundInfo: RoundEvent?,
    val timerDisplay: String,
    val roundLabel: String?,
    val controlDurations: Map<Competitor, String?>,
    val roundScores: Map<Competitor, Int>,
    val audio: AudioEvent?,
)
