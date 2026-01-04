package dev.jvmname.accord.prefs

import dev.zacsweers.metro.AppScope
import dev.zacsweers.metro.ContributesBinding
import dev.zacsweers.metro.Inject
import java.io.File

@[Inject ContributesBinding(AppScope::class)]
class JvmAppDirs : AppDirs {
    override fun getDataStorePath(filename: String): String {
        val dir = System.getProperty("java.io.tmpdir")
        val file = File(dir, filename)
        return file.absolutePath
    }
}