package dev.jvmname.accord.di

import accord.app.BuildConfig
import dev.jvmname.accord.network.BaseUrl

actual fun platformBaseUrl(): BaseUrl = BaseUrl(BuildConfig.BASE_URL)