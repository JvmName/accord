package dev.jvmname.accord.di

import accord.shared.BuildConfig
import dev.jvmname.accord.network.BaseUrl

actual fun platformBaseUrl(): BaseUrl = BaseUrl(BuildConfig.BASE_URL)