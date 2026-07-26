package com.nka.bulletin.presentation.search

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.nka.bulletin.domain.model.Bulletin
import com.nka.bulletin.domain.usecase.SearchBulletinsUseCase
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class SearchUiState(
    val query: String = "",
    val results: List<Bulletin> = emptyList(),
    val isSearching: Boolean = false,
    val hasResults: Boolean = false
)

@HiltViewModel
class SearchViewModel @Inject constructor(
    private val searchBulletinsUseCase: SearchBulletinsUseCase
) : ViewModel() {

    private val _uiState = MutableStateFlow(SearchUiState())
    val uiState: StateFlow<SearchUiState> = _uiState.asStateFlow()

    private var searchJob: Job? = null

    fun onQueryChanged(query: String) {
        _uiState.value = _uiState.value.copy(
            query = query,
            isSearching = query.isNotBlank()
        )

        searchJob?.cancel()

        if (query.isBlank()) {
            _uiState.value = SearchUiState()
            return
        }

        searchJob = viewModelScope.launch {
            delay(300) // Debounce 300ms

            searchBulletinsUseCase(query).collect { bulletins ->
                _uiState.value = _uiState.value.copy(
                    results = bulletins,
                    isSearching = false,
                    hasResults = bulletins.isNotEmpty()
                )
                return@collect
            }
        }
    }

    fun clearSearch() {
        _uiState.value = SearchUiState()
        searchJob?.cancel()
    }
}
