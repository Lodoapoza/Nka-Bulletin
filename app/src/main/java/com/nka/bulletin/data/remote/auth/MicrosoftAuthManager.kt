package com.nka.bulletin.data.remote.auth

import android.app.Activity
import android.content.Context
import com.microsoft.identity.client.AcquireTokenParameters
import com.microsoft.identity.client.AuthenticationCallback
import com.microsoft.identity.client.IAuthenticationResult
import com.microsoft.identity.client.IMultipleAccountPublicClientApplication
import com.microsoft.identity.client.PublicClientApplication
import com.microsoft.identity.client.exception.MsalException
import com.nka.bulletin.R
import com.nka.bulletin.data.local.secure.SecureStorageManager
import com.nka.bulletin.domain.model.MailConfig
import com.nka.bulletin.domain.model.MailProviderType
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.suspendCancellableCoroutine
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.coroutines.resume

@Singleton
class MicrosoftAuthManager @Inject constructor(
    @ApplicationContext private val context: Context,
    private val secureStorage: SecureStorageManager
) {

    companion object {
        private val SCOPES = listOf(
            "https://graph.microsoft.com/Mail.Read",
            "https://graph.microsoft.com/Mail.ReadWrite"
        )
    }

    private var application: IMultipleAccountPublicClientApplication? = null

    suspend fun initialize(): Result<Unit> {
        return suspendCancellableCoroutine { continuation ->
            PublicClientApplication.createMultipleAccountPublicClientApplication(
                context,
                R.raw.msal_config,
                object : PublicClientApplication.IMultipleAccountApplicationCreatedListener {
                    override fun onCreated(app: IMultipleAccountPublicClientApplication) {
                        application = app
                        continuation.resume(Result.success(Unit))
                    }

                    override fun onError(exception: MsalException) {
                        continuation.resume(Result.failure(exception))
                    }
                }
            )
        }
    }

    suspend fun acquireToken(activity: Activity): Result<String> {
        initialize().getOrThrow()
        val app = application
            ?: return Result.failure(IllegalStateException("MSAL not initialized"))

        return suspendCancellableCoroutine { continuation ->
            val params = AcquireTokenParameters.Builder()
                .startAuthorizationFromActivity(activity)
                .withScopes(SCOPES)
                .withCallback(object : AuthenticationCallback {
                    override fun onSuccess(authenticationResult: IAuthenticationResult) {
                        val token = authenticationResult.accessToken
                        val email = authenticationResult.account?.username ?: ""
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

                    override fun onError(exception: MsalException) {
                        continuation.resume(Result.failure(exception))
                    }

                    override fun onCancel() {
                        continuation.resume(Result.failure(Exception("Authentication cancelled")))
                    }
                })
                .build()
            app.acquireToken(params)
        }
    }

    fun isSignedIn(): Boolean {
        return secureStorage.getToken(MailProviderType.OUTLOOK) != null
    }

    fun signOut() {
        secureStorage.clearMailConfig(MailProviderType.OUTLOOK)
    }
}
