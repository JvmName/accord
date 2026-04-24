package dev.jvmname.accord.prefs

import androidx.datastore.core.FileStorage
import androidx.datastore.core.Storage
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.PreferencesFileSerializer
import okio.Path

actual fun createPrefsStorage(path: Path): Storage<Preferences> {
    return FileStorage(PreferencesFileSerializer) {
        val file = path.toFile()
        check(file.extension == "preferences_pb") {
            "File extension for file: $file does not match required extension for" +
                    " Preferences file: preferences_pb"
        }
        file.absoluteFile
    }
}