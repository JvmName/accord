package dev.jvmname.accord.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.LineHeightStyle
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp

private val baseline = Typography()

val AccordTypography = Typography(
    displayLarge = baseline.displayLarge,
    displayMedium = baseline.displayMedium,
    displaySmall = baseline.displaySmall,
    headlineLarge = baseline.headlineLarge,
    headlineMedium = baseline.headlineMedium,
    headlineSmall = baseline.headlineSmall,
    titleLarge = baseline.titleLarge,
    titleMedium = baseline.titleMedium,
    titleSmall = baseline.titleSmall,
    bodyLarge = baseline.bodyLarge,
    bodyMedium = baseline.bodyMedium,
    bodySmall = baseline.bodySmall,
    labelLarge = baseline.labelLarge,
    labelMedium = baseline.labelMedium,
    labelSmall = baseline.labelSmall
)

val Typography.TabletScore: TextStyle
    get() = AccordTypography.displayLarge.copy(
        fontSize = 330.sp,
        lineHeight = 0.75.em,
        lineHeightStyle = LineHeightStyle.Default.copy(
            mode = LineHeightStyle.Mode.Tight
        ),
        fontWeight = FontWeight.Bold
    )

val Typography.TabletCompetitor: TextStyle
    get() = AccordTypography.displayLarge.copy(
        fontSize = 75.sp,
        fontWeight = FontWeight.Bold
    )


val Typography.TabletTimeDisplay: TextStyle
    get() = AccordTypography.displayLarge.copy(
        fontSize = 170.sp,
        fontWeight = FontWeight.Medium,
    )