package dev.jvmname.accord.ui.session

import dev.drewhamilton.poko.Poko
import dev.jvmname.accord.domain.Competitor
import dev.jvmname.accord.domain.control.rounds.RoundEvent
import dev.jvmname.accord.domain.control.score.Score

@Poko
class MatchState(
    val score: Score,
    val roundInfo: RoundEvent?,
    val timerDisplay: String,
    val roundLabel: String?,
    val showPointControls: Boolean,
    val controlDurations: Map<Competitor, String?>,
)
