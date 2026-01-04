package dev.jvmname.accord.prefs

import dev.jvmname.accord.di.PlatformContext

actual fun createAppDir(filename: String, context: PlatformContext): String {
    return context.filesDir.resolve(filename).absolutePath
}