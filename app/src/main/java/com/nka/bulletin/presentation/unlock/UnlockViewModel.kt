package com.nka.bulletin.presentation.unlock

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.nka.bulletin.domain.repository.AuthRepository
import com.nka.bulletin.domain.usecase.VerifyPasswordUseCase
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class UnlockUiState(
    val pin: String = "",
    val attempts: Int = 0,
    val isLocked: Boolean = false,
    val lockoutTime: Int = 0, // secondes restantes
    val error: String? = null,
    val isBiometricAvailable: Boolean = false,
    val pinLength: Int = 6
)

@HiltViewModel
class UnlockViewModel @Inject constructor(
    private val verifyPasswordUseCase: VerifyPasswordUseCase,
    private val authRepository: AuthRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(UnlockUiState())
    val uiState: StateFlow<UnlockUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(
                isBiometricAvailable = authRepository.hasBiometric()
            )
        }
    }

    fun onDigitClicked(digit: String) {
        val currentState = _uiState.value
        if (currentState.isLocked || currentState.pin.length >= 6) return

        val newPin = currentState.pin + digit
        _uiState.value = currentState.copy(pin = newPin)

        if (newPin.length == 6) {
            verifyPin(newPin)
        }
    }

    fun onDeleteClicked() {
        val currentState = _uiState.value
        if (currentState.pin.isNotEmpty()) {
            _uiState.value = currentState.copy(
                pin = currentState.pin.dropLast(1),
                error = null
            )
        }
    }

    private fun verifyPin(pin: String) {
        viewModelScope.launch {
            val isValid = verifyPasswordUseCase(pin)
            if (isValid) {
                _uiState.value = _uiState.value.copy(
                    pin = pin,
                    error = null
                )
                // Le navigateur observera ce changement
            } else {
                val newAttempts = _uiState.value.attempts + 1
                if (newAttempts >= 3) {
                    startLockout()
                } else {
                    _uiState.value = _uiState.value.copy(
                        pin = "",
                        attempts = newAttempts,
                        error = "Code incorrect. Tentative ${newAttempts}/3"
                    )
                }
            }
        }
    }

    private fun startLockout() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(
                isLocked = true,
                lockoutTime = 30,
                error = "Trop de tentatives. Réessayez dans 30 secondes."
            )

            for (i in 30 downTo 1) {
                _uiState.value = _uiState.value.copy(lockoutTime = i)
                delay(1000)
            }

            _uiState.value = _uiState.value.copy(
                isLocked = false,
                attempts = 0,
                pin = "",
                error = null
            )
        }
    }

    fun onBiometricSuccess() {
        _uiState.value = _uiState.value.copy(pin = "BIOMETRIC_OK")
    }

    fun onBiometricError(error: String) {
        _uiState.value = _uiState.value.copy(error = error)
    }
}
