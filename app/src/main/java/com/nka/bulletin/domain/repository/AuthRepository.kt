package com.nka.bulletin.domain.repository

import com.nka.bulletin.domain.model.MailProviderType

/**
 * Interface repository pour l'authentification et la sécurité.
 */
interface AuthRepository {

    suspend fun isAuthenticated(): Boolean

    suspend fun getAuthToken(provider: MailProviderType): String?

    suspend fun saveAuthToken(provider: MailProviderType, token: String)

    suspend fun clearAuth(provider: MailProviderType)

    suspend fun clearAllAuth()

    // PIN management
    suspend fun isPinSet(): Boolean

    suspend fun verifyPin(pin: String): Boolean

    suspend fun setPin(pin: String)

    suspend fun clearPin()

    // Biometric
    suspend fun hasBiometric(): Boolean

    // Mail configuration
    suspend fun getMailConfigs(): List<com.nka.bulletin.domain.model.MailConfig>

    suspend fun saveMailConfig(config: com.nka.bulletin.domain.model.MailConfig)

    suspend fun clearMailConfig(provider: MailProviderType)
}
