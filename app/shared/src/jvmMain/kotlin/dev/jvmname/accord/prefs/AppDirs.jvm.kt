package dev.jvmname.accord.prefs

import dev.jvmname.accord.di.PlatformContext
import java.io.File

actual fun createAppDir(filename: String, context: PlatformContext): String {
    val dir = System.getProperty("java.io.tmpdir")
    val file = File(dir, filename)
    return file.absolutePath
}