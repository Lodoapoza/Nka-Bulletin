package com.nka.bulletin.presentation.unlock

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.nka.bulletin.domain.repository.AuthRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class PinSetupUiState(
    val pin: String = "",
    val isConfirming: Boolean = false,
    val firstPin: String = "",
    val error: String? = null,
    val isPinSet: Boolean = false
)

@HiltViewModel
class PinSetupViewModel @Inject constructor(
    private val authRepository: AuthRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(PinSetupUiState())
    val uiState: StateFlow<PinSetupUiState> = _uiState.asStateFlow()

    fun onDigitClicked(digit: String) {
        val currentState = _uiState.value
        if (currentState.pin.length >= 6) return

        val newPin = currentState.pin + digit
        _uiState.value = currentState.copy(pin = newPin, error = null)

        if (newPin.length == 6) {
            if (!currentState.isConfirming) {
                // Première saisie → passer en confirmation
                _uiState.value = _uiState.value.copy(
                    pin = "",
                    isConfirming = true,
                    firstPin = newPin
                )
            } else {
                // Confirmation → vérifier
                if (newPin == currentState.firstPin) {
                    savePin(newPin)
                } else {
                    _uiState.value = _uiState.value.copy(
                        pin = "",
                        isConfirming = false,
                        firstPin = "",
                        error = "Les codes ne correspondent pas"
                    )
                }
            }
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

    private fun savePin(pin: String) {
        viewModelScope.launch {
            authRepository.setPin(pin)
            _uiState.value = _uiState.value.copy(isPinSet = true)
        }
    }
}
