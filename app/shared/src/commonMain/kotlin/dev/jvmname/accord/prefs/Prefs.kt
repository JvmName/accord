package dev.jvmname.accord.prefs

import androidx.datastore.core.DataStore
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

    suspend fun setAuthToken(token: AuthToken?) {
        datastore.edit { prefs ->
            prefs.remove(AUTH_TOKEN)
            token?.let { prefs[AUTH_TOKEN] = it.token }
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
            .map { prefs -> prefs[MAT_INFO]?.let { json.decodeFromString<Mat>(it) } }
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
        datastore.edit { prefs ->
            if (match == null) {
                prefs.remove(CURRENT_MATCH)
            } else {
                prefs[CURRENT_MATCH] = json.encodeToString(match)
            }
        }
    }

    fun observeCurrentMatch(): Flow<Match?> {
        return datastore.data.map { prefs ->
            prefs[CURRENT_MATCH]?.let { json.decodeFromString<Match>(it) }
        }
    }

    suspend fun updateJoinCode(code: String?) {
        datastore.edit { prefs ->
            if (code == null) prefs.remove(JOIN_CODE)
            else prefs[JOIN_CODE] = code
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
        datastore.edit { it.remove(PRE_BOOST_VOLUME) }
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