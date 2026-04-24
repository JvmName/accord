package dev.jvmname.accord.prefs

import androidx.datastore.core.DataStore
import androidx.datastore.core.Storage
import androidx.datastore.core.handlers.ReplaceFileCorruptionHandler
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.emptyPreferences
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import dev.jvmname.accord.common.Dispatchers
import dev.jvmname.accord.network.AuthToken
import dev.jvmname.accord.network.Mat
import dev.jvmname.accord.network.Match
import dev.jvmname.accord.network.User
import dev.zacsweers.metro.AppScope
import dev.zacsweers.metro.Inject
import dev.zacsweers.metro.SingleIn
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.plus
import kotlinx.serialization.json.Json
import okio.Path


expect fun createPrefsStorage(path: Path): Storage<Preferences>

@[Inject SingleIn(AppScope::class)]
class Prefs(
    private val dirs: AppDirs,
    private val json: Json,
    scope: CoroutineScope
) {

    private val datastore: DataStore<Preferences> by lazy {
        PreferenceDataStoreFactory.create(
            storage = createPrefsStorage(dirs.getDataStorePath(FILENAME)),
            corruptionHandler = ReplaceFileCorruptionHandler { emptyPreferences() },
            migrations = emptyList(),
            scope = scope + Dispatchers.IO,
        )
    }

    suspend fun setAuthToken(token: AuthToken?) {
        val tokenStr = token?.token
        datastore.edit { prefs ->
            if (tokenStr != null) prefs[AUTH_TOKEN] = tokenStr
            else if (prefs[AUTH_TOKEN] != null) prefs.remove(AUTH_TOKEN)
        }
    }

    suspend fun getAuthToken(): AuthToken? {
        return datastore.data.first()[AUTH_TOKEN]?.let { AuthToken(it) }
    }


    suspend fun updateMatInfo(info: Mat?) {
        datastore.edit { prefs ->
            if (info == null) prefs.clear()
            else prefs[MAT_INFO] = json.encodeToString(info)
        }
    }

    fun observeMatInfo(): Flow<Mat?> {
        return datastore.data
            .map { prefs -> prefs[MAT_INFO] }
            .map { j -> j?.let { json.decodeFromString<Mat>(it ) } }

    }

    suspend fun updateMainUser(user: User) {
        datastore.edit {
            it[MAIN_USER] = json.encodeToString(user)
        }
    }

    suspend fun hasMainUser(): Boolean = datastore.data.first()[MAIN_USER] != null

    suspend fun getMainUser(): User {
        return json.decodeFromString(datastore.data.first()[MAIN_USER]!!)
    }

    suspend fun updateCurrentMatch(match: Match?) {
        val matchStr = match?.let { json.encodeToString(it) }
        datastore.edit { prefs ->
            if (matchStr != null) prefs[CURRENT_MATCH] = matchStr
            else if (prefs[CURRENT_MATCH] != null) prefs.remove(CURRENT_MATCH)
        }
    }

    fun observeCurrentMatch(): Flow<Match?> {
        return datastore.data.map { prefs ->
            prefs[CURRENT_MATCH]?.let { runCatching { json.decodeFromString<Match>(it) }.getOrNull() }
        }
    }

    suspend fun updateJoinCode(code: String?) {
        datastore.edit { prefs ->
            if (code != null) prefs[JOIN_CODE] = code
            else if (prefs[JOIN_CODE] != null) prefs.remove(JOIN_CODE)
        }
    }

    suspend fun getJoinCode(): String? {
        return datastore.data.first()[JOIN_CODE]
    }

    suspend fun savePreBoostVolume(volume: Int) {
        datastore.edit { it[PRE_BOOST_VOLUME] = volume }
    }

    suspend fun getPreBoostVolume(): Int? {
        return datastore.data.first()[PRE_BOOST_VOLUME]
    }

    suspend fun clearPreBoostVolume() {
        datastore.edit { prefs ->
            if (prefs[PRE_BOOST_VOLUME] != null) prefs.remove(PRE_BOOST_VOLUME)
        }
    }

    companion object {
        const val FILENAME = "prefs.preferences_pb"
        val MAT_INFO = stringPreferencesKey("mat_info")
        val AUTH_TOKEN = stringPreferencesKey("auth_token")
        val MAIN_USER = stringPreferencesKey("user.main")
        val CURRENT_MATCH = stringPreferencesKey("current_match")
        val JOIN_CODE = stringPreferencesKey("join_code")
        val PRE_BOOST_VOLUME = intPreferencesKey("pre_boost_volume")
    }
}