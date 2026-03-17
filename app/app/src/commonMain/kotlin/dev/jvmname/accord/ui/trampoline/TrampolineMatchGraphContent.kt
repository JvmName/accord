package dev.jvmname.accord.ui.trampoline

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import com.slack.circuit.backstack.rememberSaveableBackStack
import com.slack.circuit.codegen.annotations.CircuitInject
import com.slack.circuit.foundation.CircuitCompositionLocals
import com.slack.circuit.foundation.NavigableCircuitContent
import com.slack.circuit.foundation.rememberCircuitNavigator
import com.slack.circuitx.gesturenavigation.GestureNavigationDecorationFactory
import dev.zacsweers.metro.AppScope

@[Composable CircuitInject(TrampolineMatchGraphScreen::class, AppScope::class)]
fun TrampolineMatchGraphContent(
    state: TrampolineMatchGraphState,
    modifier: Modifier = Modifier,
) {
    val innerBackstack = rememberSaveableBackStack(root = state.innerRoot)
    val innerNavigator = rememberCircuitNavigator(
        backStack = innerBackstack,
        onRootPop = state.onRootPop,
    )

    CircuitCompositionLocals(state.matchGraph.circuit) {
        NavigableCircuitContent(
            navigator = innerNavigator,
            backStack = innerBackstack,
            modifier = modifier,
            decoratorFactory = remember(innerNavigator) {
                GestureNavigationDecorationFactory(onBackInvoked = innerNavigator::pop)
            }
        )
    }
}
