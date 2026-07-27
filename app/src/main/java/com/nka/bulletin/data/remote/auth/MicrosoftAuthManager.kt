package com.nka.bulletin.data.remote.auth

import android.app.Activity
import android.content.Context
import com.microsoft.identity.client.AcquireTokenParameters
import com.microsoft.identity.client.IAuthenticationResult
import com.microsoft.identity.client.IMultipleAccountPublicClientApplication
import com.microsoft.identity.client.PublicClientApplication
import com.microsoft.identity.client.exception.MsalClientException
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
 * Utilise MSAL (Microsoft Authentication Library) 4.1.0.
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
        private const val SCOPES = listOf(
            "https://graph.microsoft.com/Mail.Read",
            "https://graph.microsoft.com/Mail.ReadWrite"
        )
        private const val AUTHORITY = "https://login.microsoftonline.com/common"
    }

    private var application: IMultipleAccountPublicClientApplication? = null

    /**
     * Initialise l'application MSAL.
     */
    suspend fun initialize(): Result<Unit> = runCatching {
        suspendCancellableCoroutine { continuation ->
            PublicClientApplication.createMultipleAccountPublicClientApplication(
                context,
                CLIENT_ID,
                object : PublicClientApplication.OnApplicationCreatedListener {
                    override fun onCreated(app: IMultipleAccountPublicClientApplication) {
                        application = app
                        continuation.resume(Unit)
                    }
                    override fun onError(exception: MsalClientException) {
                        continuation.resume(Result.failure(exception))
                    }
                }
            )
        }
    }

    /**
     * Acquiert un token via MSAL.
     */
    suspend fun acquireToken(activity: Activity): Result<String> {
        initialize().getOrThrow()
        val app = application
            ?: return Result.failure(MsalClientException("MSAL not initialized"))

        return suspendCancellableCoroutine { continuation ->
            val params = AcquireTokenParameters.Builder()
                .startAuthorizationFromActivity(activity)
                .withScopes(SCOPES)
                .withCallback(object : com.microsoft.identity.client.AuthenticationCallback {
                    override fun onSuccess(authenticationResult: IAuthenticationResult) {
                        val token = authenticationResult.accessToken
                        val account = authenticationResult.account
                        val email = account?.username ?: ""
                        secureStorage.saveMailConfig(
                            MailConfig(
                                provider = MailProviderType.OUTLOOK,
                                email = email,
                                token = token
                            )
                        )
                        secureStorage.saveToken(MailProviderType.OUTLOOK, token)
                        continuation.resume(Result.success(token))
                    }
                    override fun onError(exception: MsalClientException) {
                        continuation.resume(Result.failure(exception))
                    }
                    override fun onCancel() {
                        continuation.resume(Result.failure(MsalClientException("Authentication cancelled")))
                    }
                })
                .build()
            app.acquireToken(params)
        }
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
