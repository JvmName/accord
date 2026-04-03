package dev.jvmname.accord.di

import dev.jvmname.accord.network.BaseUrl

actual fun platformBaseUrl(): BaseUrl = BaseUrl("http://localhost:3000")