package com.nka.bulletin.presentation.dashboard

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.nka.bulletin.domain.model.Bulletin
import com.nka.bulletin.domain.repository.BulletinRepository
import com.nka.bulletin.domain.usecase.CheckNewBulletinsUseCase
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class DashboardUiState(
    val isLoading: Boolean = true,
    val totalBulletins: Int = 0,
    val recentBulletins: List<Bulletin> = emptyList(),
    val bulletinsByYear: Map<Int, Int> = emptyMap(),
    val isChecking: Boolean = false,
    val lastCheckResult: String? = null,
    val error: String? = null
)

@HiltViewModel
class DashboardViewModel @Inject constructor(
    private val bulletinRepository: BulletinRepository,
    private val checkNewBulletinsUseCase: CheckNewBulletinsUseCase
) : ViewModel() {

    private val _uiState = MutableStateFlow(DashboardUiState())
    val uiState: StateFlow<DashboardUiState> = _uiState.asStateFlow()

    init {
        loadDashboard()
    }

    fun loadDashboard() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true)

            try {
                // Compter les bulletins
                val count = bulletinRepository.count()

                // Récupérer les bulletins récents
                bulletinRepository.getAllBulletins().collect { bulletins ->
                    val recent = bulletins.take(3)
                    val byYear = bulletins.groupBy { it.year }.mapValues { it.value.size }

                    _uiState.value = DashboardUiState(
                        isLoading = false,
                        totalBulletins = count,
                        recentBulletins = recent,
                        bulletinsByYear = byYear
                    )
                    return@collect
                }
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    error = "Erreur de chargement: ${e.message}"
                )
            }
        }
    }

    fun refresh() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isChecking = true)

            // TODO: Lancer la vérification via le provider mail configuré
            // val configs = authRepository.getMailConfigs()
            // for (config in configs) {
            //     val result = checkNewBulletinsUseCase(config)
            //     ...
            // }

            // Simuler une vérification
            kotlinx.coroutines.delay(2000)

            _uiState.value = _uiState.value.copy(
                isChecking = false,
                lastCheckResult = "Vérification terminée. Aucun nouveau bulletin."
            )

            loadDashboard()
        }
    }

    fun clearResult() {
        _uiState.value = _uiState.value.copy(lastCheckResult = null)
    }
}
