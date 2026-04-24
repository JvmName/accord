package dev.jvmname.accord.prefs

import androidx.datastore.core.Storage
import androidx.datastore.core.okio.WebLocalStorage
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.PreferencesSerializer
import okio.Path

actual fun createPrefsStorage(path: Path): Storage<Preferences> {
    return WebLocalStorage(serializer = PreferencesSerializer, name = path.name)
}