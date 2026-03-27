package dev.jvmname.accord.domain.user

import com.github.michaelbull.result.map
import com.github.michaelbull.result.onOk
import dev.jvmname.accord.network.AccordClient
import dev.jvmname.accord.network.NetworkResult
import dev.jvmname.accord.network.User
import dev.jvmname.accord.prefs.Prefs
import dev.zacsweers.metro.Inject

@Inject
class UserManager(
    private val prefs: Prefs,
    private val apiClient: AccordClient,
) {

    suspend fun createUser(name: String): NetworkResult<User> {
        return apiClient.createUser(name)
            .onOk {
                prefs.setAuthToken(it.authToken)
                prefs.updateMainUser(it.user)
            }
            .map { it.user }
    }

    suspend fun user() = prefs.getMainUser()

    suspend fun hasUser() = prefs.hasMainUser()
}