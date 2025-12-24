package dev.jvmname.accord.prefs

interface AppDirs {
    fun getDataStorePath(filename: String): String
}

