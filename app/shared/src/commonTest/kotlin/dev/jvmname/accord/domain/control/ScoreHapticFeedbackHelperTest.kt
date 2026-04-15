package dev.jvmname.accord.domain.control

import dev.jvmname.accord.domain.Competitor
import dev.jvmname.accord.domain.control.score.Score
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals

class ScoreHapticFeedbackHelperTest {

    private fun makeHelper(
        buttonFlow: MutableSharedFlow<ButtonEvent>,
        scoreFlow: MutableStateFlow<Score>,
        testScope: kotlinx.coroutines.test.TestScope,
    ) = ScoreHapticFeedbackHelper(buttonFlow, scoreFlow, testScope)

    private fun emptyScore() = Score(0, 0, null, null, null)

    // -------------------------------------------------------------------------
    // Button event tests
    // -------------------------------------------------------------------------

    @Test
    fun `Press emits exactly 1 HapticEvent`() = runTest {
        val buttonFlow = MutableSharedFlow<ButtonEvent>()
        val scoreFlow = MutableStateFlow(emptyScore())
        val helper = makeHelper(buttonFlow, scoreFlow, this)

        val collected = mutableListOf<HapticEvent>()
        val job = launch { helper.hapticEvents.collect { collected.add(it) } }

        buttonFlow.emit(ButtonEvent.Press(Competitor.RED))
        advanceUntilIdle()

        assertEquals(1, collected.size)
        job.cancel()
    }

    @Test
    fun `Release emits exactly 1 HapticEvent`() = runTest {
        val buttonFlow = MutableSharedFlow<ButtonEvent>()
        val scoreFlow = MutableStateFlow(emptyScore())
        val helper = makeHelper(buttonFlow, scoreFlow, this)

        val collected = mutableListOf<HapticEvent>()
        val job = launch { helper.hapticEvents.collect { collected.add(it) } }

        buttonFlow.emit(ButtonEvent.Release(Competitor.RED))
        advanceUntilIdle()

        assertEquals(1, collected.size)
        job.cancel()
    }

    @Test
    fun `Holding emits exactly 1 HapticEvent`() = runTest {
        val buttonFlow = MutableSharedFlow<ButtonEvent>()
        val scoreFlow = MutableStateFlow(emptyScore())
        val helper = makeHelper(buttonFlow, scoreFlow, this)

        val collected = mutableListOf<HapticEvent>()
        val job = launch { helper.hapticEvents.collect { collected.add(it) } }

        buttonFlow.emit(ButtonEvent.Holding(Competitor.RED))
        advanceUntilIdle()

        assertEquals(1, collected.size)
        job.cancel()
    }

    @Test
    fun `SteadyState with null error emits 0 HapticEvents`() = runTest {
        val buttonFlow = MutableSharedFlow<ButtonEvent>()
        val scoreFlow = MutableStateFlow(emptyScore())
        val helper = makeHelper(buttonFlow, scoreFlow, this)

        val collected = mutableListOf<HapticEvent>()
        val job = launch { helper.hapticEvents.collect { collected.add(it) } }

        buttonFlow.emit(ButtonEvent.SteadyState(null))
        advanceUntilIdle()

        assertEquals(0, collected.size)
        job.cancel()
    }

    // -------------------------------------------------------------------------
    // Score transition tests
    // -------------------------------------------------------------------------

    @Test
    fun `techFallWin transitioning from null to RED emits exactly 1 HapticEvent`() = runTest {
        val buttonFlow = MutableSharedFlow<ButtonEvent>()
        val scoreFlow = MutableStateFlow(emptyScore())
        val helper = makeHelper(buttonFlow, scoreFlow, this)

        val collected = mutableListOf<HapticEvent>()
        val job = launch { helper.hapticEvents.collect { collected.add(it) } }

        scoreFlow.value = emptyScore().copy(techFallWin = Competitor.RED)
        advanceUntilIdle()

        assertEquals(1, collected.size)
        job.cancel()
    }

    @Test
    fun `techFallWin emitting same value again does not add another HapticEvent`() = runTest {
        val buttonFlow = MutableSharedFlow<ButtonEvent>()
        val scoreFlow = MutableStateFlow(emptyScore())
        val helper = makeHelper(buttonFlow, scoreFlow, this)

        val collected = mutableListOf<HapticEvent>()
        val job = launch { helper.hapticEvents.collect { collected.add(it) } }

        // First transition: null → RED
        scoreFlow.value = emptyScore().copy(techFallWin = Competitor.RED)
        advanceUntilIdle()
        val countAfterFirst = collected.size

        // Emit same value again — StateFlow deduplicates, so no new emission
        scoreFlow.value = emptyScore().copy(techFallWin = Competitor.RED)
        advanceUntilIdle()

        assertEquals(countAfterFirst, collected.size)
        job.cancel()
    }

    @Test
    fun `redPoints incrementing from 0 to 1 emits exactly 1 HapticEvent`() = runTest {
        val buttonFlow = MutableSharedFlow<ButtonEvent>()
        val scoreFlow = MutableStateFlow(emptyScore())
        val helper = makeHelper(buttonFlow, scoreFlow, this)

        val collected = mutableListOf<HapticEvent>()
        val job = launch { helper.hapticEvents.collect { collected.add(it) } }

        scoreFlow.value = emptyScore().copy(redPoints = 1)
        advanceUntilIdle()

        assertEquals(1, collected.size)
        job.cancel()
    }

    // -------------------------------------------------------------------------
    // Combined test
    // -------------------------------------------------------------------------

    @Test
    fun `Press AND techFallWin transition together emit exactly 2 HapticEvents`() = runTest {
        val buttonFlow = MutableSharedFlow<ButtonEvent>()
        val scoreFlow = MutableStateFlow(emptyScore())
        val helper = makeHelper(buttonFlow, scoreFlow, this)

        val collected = mutableListOf<HapticEvent>()
        val job = launch { helper.hapticEvents.collect { collected.add(it) } }

        buttonFlow.emit(ButtonEvent.Press(Competitor.RED))
        scoreFlow.value = emptyScore().copy(techFallWin = Competitor.RED)
        advanceUntilIdle()

        assertEquals(2, collected.size)
        job.cancel()
    }
}
