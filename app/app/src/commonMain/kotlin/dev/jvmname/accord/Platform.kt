package dev.jvmname.accord

interface Platform {
    val name: String
}

expect fun getPlatform(): Platform