package dev.jvmname.accord.prefs

import androidx.datastore.core.DataStore
import androidx.datastore.core.handlers.ReplaceFileCorruptionHandler
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.emptyPreferences
import androidx.datastore.preferences.core.stringPreferencesKey
import dev.jvmname.accord.network.model.MatInfo
import dev.zacsweers.metro.AppScope
import dev.zacsweers.metro.Inject
import dev.zacsweers.metro.SingleIn
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.plus
import kotlinx.serialization.json.Json
import okio.Path.Companion.toPath

@[Inject SingleIn(AppScope::class)]
class Prefs(
    private val dirs: AppDirs,
    private val json: Json,
    scope: CoroutineScope
) {
    private val datastore: DataStore<Preferences> by lazy {
        PreferenceDataStoreFactory.createWithPath(
            corruptionHandler = ReplaceFileCorruptionHandler { emptyPreferences() },
            migrations = emptyList(),
            scope = scope + Dispatchers.IO,
            produceFile = { dirs.getDataStorePath(FILENAME) },
        )
    }

    suspend fun updateMatInfo(info: MatInfo?) {
        datastore.edit { prefs ->
            if (info == null) prefs.clear()
            else prefs[MAT_INFO] = json.encodeToString(info)
        }

    }

    fun observeMatInfo(): Flow<MatInfo?> {
        return datastore.data
            .map { prefs -> prefs[MAT_INFO]?.let { json.decodeFromString<MatInfo>(it) } }
    }

    companion object {
        const val FILENAME = "prefs.preferences_pb"
        val MAT_INFO = stringPreferencesKey("mat_info")
    }
}