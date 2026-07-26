package com.nka.bulletin.data.remote.auth

import android.accounts.AccountManager
import android.content.Context
import android.content.Intent
import com.google.api.client.googleapis.extensions.android.gms.auth.GoogleAccountCredential
import com.google.api.client.http.javanet.NetHttpTransport
import com.google.api.client.json.gson.GsonFactory
import com.google.api.services.gmail.GmailScopes
import com.nka.bulletin.data.local.secure.SecureStorageManager
import com.nka.bulletin.domain.model.MailProviderType
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Gère l'authentification OAuth2 Google.
 * Utilise GoogleAccountCredential pour obtenir les tokens.
 *
 * Note : Le client ID OAuth2 doit être configuré dans Google Cloud Console.
 * Pour le développement, on utilise le credential par défaut.
 */
@Singleton
class GoogleAuthManager @Inject constructor(
    @ApplicationContext private val context: Context,
    private val secureStorage: SecureStorageManager
) {

    /**
     * Crée un GoogleAccountCredential pour l'API Gmail.
     */
    fun getCredential(): GoogleAccountCredential {
        return GoogleAccountCredential.usingOAuth2(
            context,
            listOf(GmailScopes.GMAIL_READONLY, GmailScopes.GMAIL_MODIFY)
        ).apply {
            // Le accountName doit être défini après sélection du compte
        }
    }

    /**
     * Sauvegarde le token après authentification réussie.
     */
    fun onAuthSuccess(accountName: String, token: String) {
        secureStorage.saveMailConfig(
            com.nka.bulletin.domain.model.MailConfig(
                provider = MailProviderType.GMAIL,
                email = accountName,
                token = token
            )
        )
        secureStorage.saveToken(MailProviderType.GMAIL, token)
    }

    /**
     * Vérifie si un compte Gmail est déjà configuré.
     */
    fun isSignedIn(): Boolean {
        return secureStorage.getToken(MailProviderType.GMAIL) != null
    }

    /**
     * Déconnexion.
     */
    fun signOut() {
        secureStorage.clearMailConfig(MailProviderType.GMAIL)
    }
}
