package com.nka.bulletin.domain.usecase

import androidx.fragment.app.FragmentActivity
import androidx.biometric.BiometricPrompt
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_STRONG
import androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_WEAK
import androidx.biometric.BiometricManager.Authenticators.DEVICE_CREDENTIAL
import androidx.core.content.ContextCompat
import com.nka.bulletin.domain.repository.AuthRepository
import java.util.concurrent.Executor
import javax.inject.Inject

/**
 * Vérifie le PIN de déverrouillage et gère l'authentification biométrique.
 */
class VerifyPasswordUseCase @Inject constructor(
    private val authRepository: AuthRepository
) {

    /**
     * Vérifie le PIN saisi.
     */
    suspend operator fun invoke(pin: String): Boolean {
        return authRepository.verifyPin(pin)
    }

    /**
     * Définit un nouveau PIN.
     * Hashé avant stockage via PBKDF2 (implémentation dans SecureStorage).
     */
    suspend fun setPin(pin: String) {
        require(pin.length == 6) { "Le PIN doit faire exactement 6 chiffres" }
        require(pin.all { it.isDigit() }) { "Le PIN doit être numérique" }
        authRepository.setPin(pin)
    }

    /**
     * Vérifie si un PIN a déjà été défini.
     */
    suspend fun isPinSet(): Boolean {
        return authRepository.isPinSet()
    }

    /**
     * Vérifie si l'appareil supporte la biométrie.
     */
    suspend fun isBiometricAvailable(): Boolean {
        return authRepository.hasBiometric()
    }

    /**
     * Lance l'authentification biométrique.
     * @param activity Activity hôte (doit être FragmentActivity pour BiometricPrompt)
     * @param onSuccess Callback en cas de succès
     * @param onError Callback en cas d'erreur/échec
     */
    fun authenticateBiometric(
        activity: FragmentActivity,
        onSuccess: () -> Unit,
        onError: (String) -> Unit
    ) {
        val executor: Executor = ContextCompat.getMainExecutor(activity)

        val biometricPrompt = BiometricPrompt(
            activity,
            executor,
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    super.onAuthenticationSucceeded(result)
                    onSuccess()
                }

                override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                    super.onAuthenticationError(errorCode, errString)
                    onError(errString.toString())
                }

                override fun onAuthenticationFailed() {
                    super.onAuthenticationFailed()
                    onError("Authentification biométrique échouée")
                }
            }
        )

        val promptInfo = BiometricPrompt.PromptInfo.Builder()
            .setTitle("Déverrouiller Nka Bulletin")
            .setSubtitle("Utilisez votre empreinte digitale ou votre visage")
            .setAllowedAuthenticators(
                BIOMETRIC_STRONG or BIOMETRIC_WEAK or DEVICE_CREDENTIAL
            )
            .build()

        biometricPrompt.authenticate(promptInfo)
    }
}
