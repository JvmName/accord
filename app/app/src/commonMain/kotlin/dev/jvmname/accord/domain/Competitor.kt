package dev.jvmname.accord.domain

import androidx.compose.ui.graphics.Color
import dev.jvmname.accord.network.CompetitorColor
import dev.jvmname.accord.ui.capitalize
import java.util.*

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

val Competitor.asColor: CompetitorColor
    get() = when (this) {
        Competitor.RED -> CompetitorColor.RED
        Competitor.BLUE -> CompetitorColor.BLUE
    }

val Competitor.asEmoji: String
    get() = when (this) {
        Competitor.RED -> "🟥"
        Competitor.BLUE -> "🟦"
    }