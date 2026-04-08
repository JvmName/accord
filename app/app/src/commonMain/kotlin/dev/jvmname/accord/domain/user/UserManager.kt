package dev.jvmname.accord.domain.user

import co.touchlab.kermit.Logger
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
    private val log = Logger.withTag("Domain/UserManager")

    suspend fun createUser(name: String): NetworkResult<User> {
        log.i { "creating user name='$name'" }
        return apiClient.createUser(name)
            .onOk {
                prefs.setAuthToken(it.authToken)
                prefs.updateMainUser(it.user)
                log.i { "user created id=${it.user.id}, token cached" }
            }
            .map { it.user }
    }

    suspend fun user() = prefs.getMainUser()

    suspend fun hasUser() = prefs.hasMainUser()
}