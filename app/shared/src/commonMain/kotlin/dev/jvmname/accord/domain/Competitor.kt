package dev.jvmname.accord.domain

import androidx.compose.ui.graphics.Color
import dev.jvmname.accord.network.CompetitorColor

enum class Competitor {
    Orange, Green
}

val Competitor.color: Color
    get() = when (this) {
        Competitor.Orange -> Color(0xFFFF6D00)   // orange
        Competitor.Green -> Color(0xFF00A550)  // green
    }

val Competitor.colorDark: Color
    get() = when (this) {
        Competitor.Orange -> Color(0xFFE65100)   // dark orange
        Competitor.Green -> Color(0xFF00703A)  // dark green
    }

val Competitor.colorLight: Color
    get() = when (this) {
        Competitor.Orange -> Color(0xFFFFCC80)   // light orange
        Competitor.Green -> Color(0xFF80C89A)  // light green
    }

val Competitor.nameStr: String
    get() = when (this) {
        Competitor.Orange -> "Orange"
        Competitor.Green -> "Green"
    }

val Competitor.asColor: CompetitorColor
    get() = when (this) {
        Competitor.Orange -> CompetitorColor.RED
        Competitor.Green -> CompetitorColor.BLUE
    }

val Competitor?.asEmoji: String
    get() = when (this) {
        Competitor.Orange -> "🟧"
        Competitor.Green -> "🟩"
        null -> "⬜"
    }
