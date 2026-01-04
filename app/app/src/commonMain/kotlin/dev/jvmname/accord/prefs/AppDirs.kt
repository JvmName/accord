package dev.jvmname.accord.prefs

import dev.jvmname.accord.di.PlatformContext
import dev.zacsweers.metro.Inject
import okio.Path
import okio.Path.Companion.toPath

@Inject
class AppDirs(private val context: PlatformContext) {
    fun getDataStorePath(filename: String): Path {
        return createAppDir(filename, context).toPath()
    }
}

expect fun createAppDir(filename: String, context: PlatformContext): String
