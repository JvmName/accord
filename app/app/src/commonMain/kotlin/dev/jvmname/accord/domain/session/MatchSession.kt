package dev.jvmname.accord.domain.session

import dev.jvmname.accord.domain.Competitor
import dev.jvmname.accord.domain.control.HapticEvent
import dev.jvmname.accord.domain.control.rounds.RoundEvent
import dev.jvmname.accord.domain.control.score.Score
import dev.jvmname.accord.network.Match
import dev.jvmname.accord.network.NetworkResult
import dev.jvmname.accord.ui.session.ManualEditAction
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow

interface MatchObserver {
    val score: StateFlow<Score>
    val roundEvent: StateFlow<RoundEvent?>
    val hapticEvents: SharedFlow<HapticEvent>
}

interface PausableSession : MatchObserver {
    fun pause()
    fun resume()
}

interface JudgingSession : PausableSession {
    fun recordPress(competitor: Competitor)
    fun recordRelease(competitor: Competitor)
}

interface RoundController : PausableSession {
    suspend fun startMatch(): NetworkResult<Match>
    suspend fun endMatch(): NetworkResult<Match>
    fun startRound()
    fun endRound()
    fun manualEdit(competitor: Competitor, action: ManualEditAction)
}

interface SoloSession : JudgingSession, RoundController
