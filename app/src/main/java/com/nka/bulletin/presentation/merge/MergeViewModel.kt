package com.nka.bulletin.presentation.merge

import android.content.Context
import android.content.Intent
import androidx.core.content.FileProvider
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.nka.bulletin.domain.model.Bulletin
import com.nka.bulletin.domain.repository.BulletinRepository
import com.nka.bulletin.domain.usecase.MergeBulletinsUseCase
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.io.File
import javax.inject.Inject

data class MergeUiState(
    val selectedBulletins: List<Bulletin> = emptyList(),
    val totalPages: Int = 0,
    val isMerging: Boolean = false,
    val mergeProgress: Float = 0f,
    val outputPath: String? = null,
    val exportType: MergeBulletinsUseCase.ExportType = MergeBulletinsUseCase.ExportType.PDF_MERGE,
    val error: String? = null,
    val isComplete: Boolean = false
)

@HiltViewModel
class MergeViewModel @Inject constructor(
    private val mergeBulletinsUseCase: MergeBulletinsUseCase,
    private val bulletinRepository: BulletinRepository,
    @ApplicationContext private val context: Context
) : ViewModel() {

    private val _uiState = MutableStateFlow(MergeUiState())
    val uiState: StateFlow<MergeUiState> = _uiState.asStateFlow()

    fun loadSelectedBulletins(ids: List<Long>) {
        viewModelScope.launch {
            try {
                val bulletins = bulletinRepository.getBulletinsByIds(ids)
                _uiState.value = _uiState.value.copy(
                    selectedBulletins = bulletins,
                    totalPages = bulletins.sumOf { it.pageCount }
                )
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(
                    error = "Erreur de chargement: ${e.message}"
                )
            }
        }
    }

    fun setExportType(type: MergeBulletinsUseCase.ExportType) {
        _uiState.value = _uiState.value.copy(exportType = type)
    }

    fun mergeAndExport() {
        viewModelScope.launch {
            val state = _uiState.value
            _uiState.value = state.copy(isMerging = true, mergeProgress = 0f)

            try {
                val outputDir = File(context.cacheDir, "exports")
                if (!outputDir.exists()) outputDir.mkdirs()

                val ids = state.selectedBulletins.map { it.id }
                val result = when (state.exportType) {
                    MergeBulletinsUseCase.ExportType.PDF_MERGE ->
                        mergeBulletinsUseCase.mergePdfs(ids, outputDir.absolutePath)
                    MergeBulletinsUseCase.ExportType.ZIP_ARCHIVE ->
                        mergeBulletinsUseCase.createZip(ids, outputDir.absolutePath)
                }

                val outputPath = result.getOrThrow()
                _uiState.value = _uiState.value.copy(
                    isMerging = false,
                    mergeProgress = 1f,
                    outputPath = outputPath,
                    isComplete = true
                )
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(
                    isMerging = false,
                    error = "Erreur de fusion: ${e.message}"
                )
            }
        }
    }

    fun share() {
        val path = _uiState.value.outputPath ?: return

        val file = File(path)
        val uri = FileProvider.getUriForFile(
            context,
            "${context.packageName}.fileprovider",
            file
        )

        val mimeType = when (_uiState.value.exportType) {
            MergeBulletinsUseCase.ExportType.PDF_MERGE -> "application/pdf"
            MergeBulletinsUseCase.ExportType.ZIP_ARCHIVE -> "application/zip"
        }

        val shareIntent = Intent(Intent.ACTION_SEND).apply {
            type = mimeType
            putExtra(Intent.EXTRA_STREAM, uri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }

        context.startActivity(
            Intent.createChooser(shareIntent, "Partager les bulletins")
        )
    }

    fun reset() {
        _uiState.value = MergeUiState()
    }

    fun clearError() {
        _uiState.value = _uiState.value.copy(error = null)
    }
}
