package dev.jvmname.accord.domain.user

import com.github.michaelbull.result.map
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

    suspend fun createUser(name: String, email: String): NetworkResult<User> {
        return apiClient.createUser(name, email)
            .map {
                prefs.setAuthToken(it.apiToken)
                it.user
            }
    }

    suspend fun user() = prefs.getMainUser()
}