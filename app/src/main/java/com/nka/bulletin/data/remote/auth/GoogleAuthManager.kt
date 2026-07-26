package com.nka.bulletin.data.remote.auth

import android.content.Context
import com.nka.bulletin.data.local.secure.SecureStorageManager
import com.nka.bulletin.domain.model.MailConfig
import com.nka.bulletin.domain.model.MailProviderType
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Gère l'authentification OAuth2 Google (token stocké en sécurisé).
 */
@Singleton
class GoogleAuthManager @Inject constructor(
    @ApplicationContext private val context: Context,
    private val secureStorage: SecureStorageManager
) {

    fun onAuthSuccess(accountName: String, token: String) {
        secureStorage.saveMailConfig(
            MailConfig(
                provider = MailProviderType.GMAIL,
                email = accountName,
                token = token
            )
        )
        secureStorage.saveToken(MailProviderType.GMAIL, token)
    }

    fun isSignedIn(): Boolean {
        return secureStorage.getToken(MailProviderType.GMAIL) != null
    }

    fun signOut() {
        secureStorage.clearMailConfig(MailProviderType.GMAIL)
    }
}
