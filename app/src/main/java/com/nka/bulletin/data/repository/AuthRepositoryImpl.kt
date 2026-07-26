package com.nka.bulletin.data.repository

import android.content.Context
import com.nka.bulletin.data.local.secure.SecureStorageManager
import com.nka.bulletin.domain.model.MailConfig
import com.nka.bulletin.domain.model.MailProviderType
import com.nka.bulletin.domain.repository.AuthRepository
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AuthRepositoryImpl @Inject constructor(
    private val secureStorage: SecureStorageManager,
    @ApplicationContext private val context: Context
) : AuthRepository {

    override suspend fun isAuthenticated(): Boolean {
        return secureStorage.getAllMailConfigs().isNotEmpty()
    }

    override suspend fun getAuthToken(provider: MailProviderType): String? {
        return secureStorage.getToken(provider)
    }

    override suspend fun saveAuthToken(provider: MailProviderType, token: String) {
        secureStorage.saveToken(provider, token)
    }

    override suspend fun clearAuth(provider: MailProviderType) {
        secureStorage.clearToken(provider)
    }

    override suspend fun clearAllAuth() {
        secureStorage.clearAllTokens()
    }

    override suspend fun isPinSet(): Boolean {
        return secureStorage.isPinSet()
    }

    override suspend fun verifyPin(pin: String): Boolean {
        return secureStorage.verifyPin(pin)
    }

    override suspend fun setPin(pin: String) {
        secureStorage.savePin(pin)
    }

    override suspend fun clearPin() {
        secureStorage.clearPin()
    }

    override suspend fun hasBiometric(): Boolean {
        return secureStorage.isBiometricAvailable()
    }

    override suspend fun getMailConfigs(): List<MailConfig> {
        return secureStorage.getAllMailConfigs()
    }

    override suspend fun saveMailConfig(config: MailConfig) {
        secureStorage.saveMailConfig(config)
    }

    override suspend fun clearMailConfig(provider: MailProviderType) {
        secureStorage.clearMailConfig(provider)
    }
}
