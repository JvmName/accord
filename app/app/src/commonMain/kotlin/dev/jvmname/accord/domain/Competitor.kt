package dev.jvmname.accord.domain

import androidx.compose.ui.graphics.Color
import dev.jvmname.accord.ui.capitalize
import java.util.Locale

enum class Competitor {
    RED, BLUE
}

val Competitor.color: Color
    get() = when (this) {
        Competitor.RED -> Color.Red
        Competitor.BLUE -> Color.Blue
    }

val Competitor.nameStr: String
    get() = name.lowercase(Locale.US).capitalize()