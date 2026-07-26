package com.nka.bulletin.presentation.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.nka.bulletin.domain.model.MailConfig
import com.nka.bulletin.domain.model.MailProviderType
import com.nka.bulletin.domain.repository.AuthRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class AuthUiState(
    val isLoading: Boolean = true,
    val isFirstLaunch: Boolean = true,
    val selectedProvider: MailProviderType? = null,
    val email: String = "",
    val password: String = "",
    val imapHost: String = "",
    val imapPort: String = "993",
    val error: String? = null,
    val isConfigured: Boolean = false,
    val step: AuthStep = AuthStep.LOADING
)

enum class AuthStep {
    LOADING,
    CHOOSE_PROVIDER,
    GOOGLE_AUTH,
    MICROSOFT_AUTH,
    IMAP_CONFIG,
    PIN_SETUP,
    COMPLETE
}

@HiltViewModel
class AuthViewModel @Inject constructor(
    private val authRepository: AuthRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(AuthUiState())
    val uiState: StateFlow<AuthUiState> = _uiState.asStateFlow()

    init {
        checkInitialState()
    }

    private fun checkInitialState() {
        viewModelScope.launch {
            val isAuthenticated = authRepository.isAuthenticated()
            val isPinSet = authRepository.isPinSet()

            _uiState.value = AuthUiState(
                isLoading = false,
                isFirstLaunch = !isAuthenticated && !isPinSet,
                step = when {
                    !isAuthenticated -> AuthStep.CHOOSE_PROVIDER
                    !isPinSet -> AuthStep.PIN_SETUP
                    else -> AuthStep.COMPLETE
                },
                isConfigured = isAuthenticated && isPinSet
            )
        }
    }

    fun selectProvider(provider: MailProviderType) {
        _uiState.value = _uiState.value.copy(
            selectedProvider = provider,
            step = when (provider) {
                MailProviderType.GMAIL -> AuthStep.GOOGLE_AUTH
                MailProviderType.OUTLOOK -> AuthStep.MICROSOFT_AUTH
                MailProviderType.IMAP -> AuthStep.IMAP_CONFIG
            }
        )
    }

    fun updateImapEmail(email: String) {
        _uiState.value = _uiState.value.copy(email = email)
    }

    fun updateImapPassword(password: String) {
        _uiState.value = _uiState.value.copy(password = password)
    }

    fun updateImapHost(host: String) {
        _uiState.value = _uiState.value.copy(imapHost = host)
    }

    fun updateImapPort(port: String) {
        _uiState.value = _uiState.value.copy(imapPort = port)
    }

    fun configureImap() {
        viewModelScope.launch {
            val state = _uiState.value
            if (state.email.isBlank() || state.password.isBlank() || state.imapHost.isBlank()) {
                _uiState.value = state.copy(error = "Tous les champs sont requis")
                return@launch
            }

            try {
                val config = MailConfig(
                    provider = MailProviderType.IMAP,
                    email = state.email,
                    token = state.password,
                    imapHost = state.imapHost,
                    imapPort = state.imapPort.toIntOrNull() ?: 993
                )
                authRepository.saveMailConfig(config)
                authRepository.saveAuthToken(MailProviderType.IMAP, state.password)
                _uiState.value = _uiState.value.copy(
                    error = null,
                    step = AuthStep.PIN_SETUP
                )
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(
                    error = "Erreur de configuration: ${e.message}"
                )
            }
        }
    }

    fun onGoogleAuthSuccess(email: String, token: String) {
        viewModelScope.launch {
            val config = MailConfig(
                provider = MailProviderType.GMAIL,
                email = email,
                token = token
            )
            authRepository.saveMailConfig(config)
            authRepository.saveAuthToken(MailProviderType.GMAIL, token)
            _uiState.value = _uiState.value.copy(
                error = null,
                step = AuthStep.PIN_SETUP
            )
        }
    }

    fun onMicrosoftAuthSuccess(upn: String, token: String) {
        viewModelScope.launch {
            val config = MailConfig(
                provider = MailProviderType.OUTLOOK,
                email = upn,
                token = token
            )
            authRepository.saveMailConfig(config)
            authRepository.saveAuthToken(MailProviderType.OUTLOOK, token)
            _uiState.value = _uiState.value.copy(
                error = null,
                step = AuthStep.PIN_SETUP
            )
        }
    }

    fun skipProvider() {
        _uiState.value = _uiState.value.copy(
            step = AuthStep.PIN_SETUP,
            selectedProvider = null
        )
    }

    fun onPinSet() {
        _uiState.value = _uiState.value.copy(
            step = AuthStep.COMPLETE,
            isConfigured = true
        )
    }

    fun clearError() {
        _uiState.value = _uiState.value.copy(error = null)
    }
}
