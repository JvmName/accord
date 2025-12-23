package dev.jvmname.accord.prefs

import dev.jvmname.accord.di.PlatformContext
import dev.zacsweers.metro.AppScope
import dev.zacsweers.metro.ContributesBinding
import dev.zacsweers.metro.Inject

@[Inject ContributesBinding(AppScope::class)]
class AndroidAppDirs(private val context: PlatformContext) : AppDirs {
    override fun getDataStorePath(filename: String): String {
        return context.filesDir.resolve(filename).absolutePath
    }
}