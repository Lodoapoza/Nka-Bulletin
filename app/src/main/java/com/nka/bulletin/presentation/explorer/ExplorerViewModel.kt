package com.nka.bulletin.presentation.explorer

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.nka.bulletin.domain.model.Bulletin
import com.nka.bulletin.domain.repository.BulletinRepository
import com.nka.bulletin.domain.usecase.SearchBulletinsUseCase
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class ExplorerUiState(
    val isLoading: Boolean = true,
    val searchQuery: String = "",
    val bulletins: List<Bulletin> = emptyList(),
    val filteredBulletins: List<Bulletin> = emptyList(),
    val selectedBulletins: Set<Long> = emptySet(),
    val availableYears: List<Int> = emptyList(),
    val selectedYear: Int? = null,
    val selectedMonth: Int? = null,
    val isSelectionMode: Boolean = false,
    val error: String? = null
)

@HiltViewModel
class ExplorerViewModel @Inject constructor(
    private val bulletinRepository: BulletinRepository,
    private val searchBulletinsUseCase: SearchBulletinsUseCase
) : ViewModel() {

    private val _uiState = MutableStateFlow(ExplorerUiState())
    val uiState: StateFlow<ExplorerUiState> = _uiState.asStateFlow()

    private var searchJob: Job? = null

    init {
        loadBulletins()
    }

    private fun loadBulletins() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true)

            try {
                val years = bulletinRepository.getAvailableYears()

                bulletinRepository.getAllBulletins().collect { bulletins ->
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        bulletins = bulletins,
                        filteredBulletins = bulletins,
                        availableYears = if (years.isNotEmpty()) years
                        else bulletins.map { it.year }.distinct().sortedDescending()
                    )
                    return@collect
                }
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    error = "Erreur: ${e.message}"
                )
            }
        }
    }

    fun onSearchQueryChanged(query: String) {
        _uiState.value = _uiState.value.copy(searchQuery = query)
        searchJob?.cancel()

        if (query.isBlank()) {
            _uiState.value = _uiState.value.copy(filteredBulletins = _uiState.value.bulletins)
            return
        }

        searchJob = viewModelScope.launch {
            val results = searchBulletinsUseCase(query)
            results.collect { filtered ->
                _uiState.value = _uiState.value.copy(filteredBulletins = filtered)
                return@collect
            }
        }
    }

    fun filterByYear(year: Int?) {
        _uiState.value = _uiState.value.copy(
            selectedYear = year,
            selectedMonth = null
        )
        applyFilters()
    }

    fun filterByMonth(month: Int) {
        _uiState.value = _uiState.value.copy(selectedMonth = month)
        applyFilters()
    }

    fun clearFilters() {
        _uiState.value = _uiState.value.copy(
            selectedYear = null,
            selectedMonth = null,
            searchQuery = "",
            filteredBulletins = _uiState.value.bulletins
        )
    }

    private fun applyFilters() {
        val state = _uiState.value
        var filtered = state.bulletins

        if (state.selectedYear != null) {
            filtered = filtered.filter { it.year == state.selectedYear }
        }
        if (state.selectedMonth != null) {
            filtered = filtered.filter { it.month == state.selectedMonth }
        }

        _uiState.value = state.copy(filteredBulletins = filtered)
    }

    fun toggleSelection(id: Long) {
        val current = _uiState.value.selectedBulletins.toMutableSet()
        if (current.contains(id)) {
            current.remove(id)
        } else {
            current.add(id)
        }
        _uiState.value = _uiState.value.copy(
            selectedBulletins = current,
            isSelectionMode = current.isNotEmpty()
        )
    }

    fun selectAll() {
        _uiState.value = _uiState.value.copy(
            selectedBulletins = _uiState.value.filteredBulletins.map { it.id }.toSet(),
            isSelectionMode = true
        )
    }

    fun clearSelection() {
        _uiState.value = _uiState.value.copy(
            selectedBulletins = emptySet(),
            isSelectionMode = false
        )
    }
}
