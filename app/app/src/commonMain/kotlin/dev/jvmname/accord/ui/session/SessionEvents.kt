package dev.jvmname.accord.ui.session

import com.slack.circuit.runtime.CircuitUiEvent
import dev.jvmname.accord.domain.Competitor
import dev.jvmname.accord.network.CompetitorColor

sealed interface SessionEvent : CircuitUiEvent

// Capability markers — mirror domain interfaces in MatchSession.kt
sealed interface PausableEvent : SessionEvent
sealed interface JudgingEvent : SessionEvent
sealed interface RoundControlEvent : SessionEvent

enum class ManualEditAction { INCREMENT, DECREMENT }

sealed interface JudgeSessionEvent : SessionEvent {
    data object Back : JudgeSessionEvent
    data object Pause : JudgeSessionEvent, PausableEvent
    data object Resume : JudgeSessionEvent, PausableEvent
    data class ButtonPress(val competitor: Competitor) : JudgeSessionEvent, JudgingEvent
    data class ButtonRelease(val competitor: Competitor) : JudgeSessionEvent, JudgingEvent
    data object StartRound : JudgeSessionEvent, RoundControlEvent
    data class EndRound(
        val submission: String? = null,
        val submitter: CompetitorColor? = null,
    ) : JudgeSessionEvent, RoundControlEvent
    data class ManualEdit(
        val competitor: Competitor,
        val action: ManualEditAction,
    ) : JudgeSessionEvent, RoundControlEvent
    data object Reset : JudgeSessionEvent
}

sealed interface MasterSessionEvent : SessionEvent {
    data object Back : MasterSessionEvent
    data object ReturnToMain : MasterSessionEvent
    data object ShowCodes : MasterSessionEvent
    data object ShowScores : MasterSessionEvent
    data object DismissScores : MasterSessionEvent
    data object Pause : MasterSessionEvent, PausableEvent
    data object Resume : MasterSessionEvent, PausableEvent
    data object StartRound : MasterSessionEvent, RoundControlEvent
    data class EndRound(
        val submission: String? = null,
        val submitter: Competitor? = null,
    ) : MasterSessionEvent, RoundControlEvent
    data object ShowEndRoundDialog : MasterSessionEvent
    data object DismissEndRoundDialog : MasterSessionEvent
    data object StartMatch : MasterSessionEvent
    data object EndMatch : MasterSessionEvent
}

sealed interface ViewerEvent : SessionEvent {
    data object Back : ViewerEvent
}
