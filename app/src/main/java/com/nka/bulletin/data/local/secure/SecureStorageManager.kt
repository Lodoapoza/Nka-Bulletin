package com.nka.bulletin.data.local.secure

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.nka.bulletin.domain.model.MailConfig
import com.nka.bulletin.domain.model.MailProviderType
import dagger.hilt.android.qualifiers.ApplicationContext
import java.security.SecureRandom
import java.security.spec.KeySpec
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.PBEKeySpec
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Gestionnaire de stockage sécurisé.
 * Toutes les données sensibles sont chiffrées via EncryptedSharedPreferences
 * avec la clé maître stockée dans Android Keystore.
 *
 * - Tokens OAuth2 : chiffrés AES-256
 * - PIN utilisateur : hashé avec PBKDF2 avant stockage
 * - Configs mail : chiffrées
 */
@Singleton
class SecureStorageManager @Inject constructor(
    @ApplicationContext private val context: Context
) {
    private val masterKey: MasterKey = MasterKey.Builder(context)
        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        .build()

    private val prefs: SharedPreferences = EncryptedSharedPreferences.create(
        context,
        PREFS_NAME,
        masterKey,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
    )

    // --- Tokens OAuth2 ---

    fun saveToken(provider: MailProviderType, token: String) {
        prefs.edit().putString("token_${provider.name}", token).apply()
    }

    fun getToken(provider: MailProviderType): String? {
        return prefs.getString("token_${provider.name}", null)
    }

    fun clearToken(provider: MailProviderType) {
        prefs.edit().remove("token_${provider.name}").apply()
    }

    fun clearAllTokens() {
        MailProviderType.entries.forEach { clearToken(it) }
    }

    // --- Mail Configurations ---

    fun saveMailConfig(config: MailConfig) {
        prefs.edit()
            .putString("mail_provider_${config.provider.name}", config.provider.name)
            .putString("mail_email_${config.provider.name}", config.email)
            .putString("mail_imap_host_${config.provider.name}", config.imapHost)
            .putInt("mail_imap_port_${config.provider.name}", config.imapPort ?: 993)
            .putBoolean("mail_imap_ssl_${config.provider.name}", config.imapSsl)
            .apply()
    }

    fun getMailConfig(provider: MailProviderType): MailConfig? {
        val email = prefs.getString("mail_email_${provider.name}", null) ?: return null
        return MailConfig(
            provider = provider,
            email = email,
            token = getToken(provider),
            imapHost = prefs.getString("mail_imap_host_${provider.name}", null),
            imapPort = prefs.getInt("mail_imap_port_${provider.name}", 993),
            imapSsl = prefs.getBoolean("mail_imap_ssl_${provider.name}", true)
        )
    }

    fun getAllMailConfigs(): List<MailConfig> {
        return MailProviderType.entries.mapNotNull { getMailConfig(it) }
    }

    fun clearMailConfig(provider: MailProviderType) {
        prefs.edit()
            .remove("mail_provider_${provider.name}")
            .remove("mail_email_${provider.name}")
            .remove("mail_imap_host_${provider.name}")
            .remove("mail_imap_port_${provider.name}")
            .remove("mail_imap_ssl_${provider.name}")
            .apply()
        clearToken(provider)
    }

    // --- PIN Management ---

    /**
     * Hash le PIN avec PBKDF2 avant stockage.
     */
    fun savePin(pin: String) {
        val salt = generateSalt()
        val hash = hashPin(pin, salt)
        prefs.edit()
            .putString("pin_hash", hash)
            .putString("pin_salt", salt)
            .apply()
    }

    /**
     * Vérifie le PIN saisi contre le hash stocké.
     */
    fun verifyPin(pin: String): Boolean {
        val storedHash = prefs.getString("pin_hash", null) ?: return false
        val storedSalt = prefs.getString("pin_salt", null) ?: return false
        val computedHash = hashPin(pin, storedSalt)
        return computedHash == storedHash
    }

    fun isPinSet(): Boolean {
        return prefs.contains("pin_hash")
    }

    fun clearPin() {
        prefs.edit()
            .remove("pin_hash")
            .remove("pin_salt")
            .apply()
    }

    // --- Biometric ---

    fun isBiometricAvailable(): Boolean {
        val biometricManager = androidx.biometric.BiometricManager.from(context)
        return biometricManager.canAuthenticate(
            androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_STRONG or
                    androidx.biometric.BiometricManager.Authenticators.DEVICE_CREDENTIAL
        ) == androidx.biometric.BiometricManager.BIOMETRIC_SUCCESS
    }

    // --- Private helpers ---

    private fun generateSalt(): String {
        val salt = ByteArray(16)
        SecureRandom().nextBytes(salt)
        return salt.joinToString("") { "%02x".format(it) }
    }

    private fun hashPin(pin: String, salt: String): String {
        val spec: KeySpec = PBEKeySpec(
            pin.toCharArray(),
            salt.toByteArray(),
            PBKDF2_ITERATIONS,
            KEY_LENGTH
        )
        val factory = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256")
        val hash = factory.generateSecret(spec).encoded
        return hash.joinToString("") { "%02x".format(it) }
    }

    companion object {
        private const val PREFS_NAME = "nka_secure_prefs"
        private const val PBKDF2_ITERATIONS = 100000
        private const val KEY_LENGTH = 256
    }
}
