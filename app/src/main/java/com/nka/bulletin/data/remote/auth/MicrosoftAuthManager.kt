package com.nka.bulletin.data.remote.auth

import android.content.Context
import com.microsoft.identity.client.AcquireTokenParameters
import com.microsoft.identity.client.AcquireTokenResult
import com.microsoft.identity.client.IMultipleAccountPublicClientApplication
import com.microsoft.identity.client.PublicClientApplication
import com.microsoft.identity.client.exception.MsalException
import com.nka.bulletin.data.local.secure.SecureStorageManager
import com.nka.bulletin.domain.model.MailConfig
import com.nka.bulletin.domain.model.MailProviderType
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.suspendCancellableCoroutine
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.coroutines.resume

/**
 * Gère l'authentification OAuth2 Microsoft (Outlook/Exchange).
 * Utilise MSAL (Microsoft Authentication Library).
 *
 * Note : L'application doit être enregistrée dans Azure AD Portal.
 * Le client ID par défaut est un placeholder — à remplacer.
 */
@Singleton
class MicrosoftAuthManager @Inject constructor(
    @ApplicationContext private val context: Context,
    private val secureStorage: SecureStorageManager
) {

    companion object {
        // TODO: Remplacer par le vrai Client ID Azure AD de l'application
        private const val CLIENT_ID = "YOUR_AZURE_CLIENT_ID"
        private const val SCOPES = "https://graph.microsoft.com/Mail.Read https://graph.microsoft.com/Mail.ReadWrite"
        private const val AUTHORITY = "https://login.microsoftonline.com/common"
    }

    private var application: IMultipleAccountPublicClientApplication? = null

    /**
     * Initialise l'application MSAL.
     */
    suspend fun initialize(): Result<Unit> = runCatching {
        suspendCancellableCoroutine<Result<Unit>> { continuation ->
            PublicClientApplication.createMultipleAccountPublicClientApplication(
                context,
                CLIENT_ID
            ) { result ->
                if (result.isSuccess) {
                    application = result.result
                    continuation.resume(Result.success(Unit))
                } else {
                    continuation.resume(
                        Result.failure(
                            result.exception ?: MsalException("MSAL initialization failed")
                        )
                    )
                }
            }
        }.getOrThrow()
    }

    /**
     * Acquiert un token via MSAL.
     */
    suspend fun acquireToken(): Result<String> = runCatching {
        initialize().getOrThrow()

        suspendCancellableCoroutine<Result<String>> { continuation ->
            val parameters = AcquireTokenParameters.Builder()
                .startAuthorizationFromActivity(null as android.app.Activity?)
                .withScopes(listOf(SCOPES))
                .withCallback { result ->
                    if (result is AcquireTokenResult) {
                        val token = result.authenticationResult?.accessToken
                        if (token != null) {
                            val email = result.authenticationResult?.account?.username ?: ""
                            secureStorage.saveMailConfig(
                                MailConfig(
                                    provider = MailProviderType.OUTLOOK,
                                    email = email,
                                    token = token
                                )
                            )
                            secureStorage.saveToken(MailProviderType.OUTLOOK, token)
                            continuation.resume(Result.success(token))
                        } else {
                            continuation.resume(
                                Result.failure(MsalException("", "Token null"))
                            )
                        }
                    } else {
                        continuation.resume(
                            Result.failure(MsalException("", "Authentication failed"))
                        )
                    }
                }
                .build()

            application?.acquireToken(parameters)
                ?: continuation.resume(
                    Result.failure(MsalException("", "MSAL not initialized"))
                )
        }.getOrThrow()
    }

    /**
     * Vérifie si un compte Outlook est configuré.
     */
    fun isSignedIn(): Boolean {
        return secureStorage.getToken(MailProviderType.OUTLOOK) != null
    }

    /**
     * Déconnexion.
     */
    fun signOut() {
        secureStorage.clearMailConfig(MailProviderType.OUTLOOK)
    }
}
