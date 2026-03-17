package dev.jvmname.accord.ui.trampoline

import com.slack.circuit.runtime.CircuitUiState
import com.slack.circuit.runtime.screen.PopResult
import dev.jvmname.accord.di.MatchGraph
import dev.jvmname.accord.di.MatchRole
import dev.jvmname.accord.domain.control.rounds.MatchConfig
import dev.jvmname.accord.network.Match
import dev.jvmname.accord.parcel.CommonParcelize
import dev.jvmname.accord.parcel.ParcelableScreen

@CommonParcelize
data class TrampolineMatchGraphScreen(
    val innerRoot: ParcelableScreen,
    val match: Match?,
    val matchConfig: MatchConfig,
    val matchRole: MatchRole,
) : ParcelableScreen

data class TrampolineMatchGraphState(
    val matchGraph: MatchGraph,
    val innerRoot: ParcelableScreen,
    val onRootPop: (PopResult?) -> Unit,
) : CircuitUiState
