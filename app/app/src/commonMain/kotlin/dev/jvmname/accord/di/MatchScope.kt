package dev.jvmname.accord.di

import dev.zacsweers.metro.Scope

/**
 * Scope for a single match session.
 * Created when entering a match, destroyed when leaving or completing the match.
 */
@Scope
annotation class MatchScope