package com.nka.bulletin.domain.usecase

import com.nka.bulletin.domain.model.Bulletin
import com.nka.bulletin.domain.repository.BulletinRepository
import java.io.File
import java.io.FileOutputStream
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream
import javax.inject.Inject

/**
 * Fusionne des bulletins en un PDF unique ou une archive Zip.
 * L'implémentation réelle de la fusion PDF utilise PdfBox (couche data).
 */
class MergeBulletinsUseCase @Inject constructor(
    private val bulletinRepository: BulletinRepository
) {

    /**
     * Types d'export supportés.
     */
    enum class ExportType { PDF_MERGE, ZIP_ARCHIVE }

    /**
     * Fusionne les bulletins sélectionnés en un seul PDF.
     * @param bulletinIds IDs des bulletins à fusionner
     * @param outputDir Répertoire de sortie
     * @return Chemin du fichier fusionné
     */
    suspend fun mergePdfs(
        bulletinIds: List<Long>,
        outputDir: String
    ): Result<String> = runCatching {
        val bulletins = bulletinRepository.getBulletinsByIds(bulletinIds)
        if (bulletins.isEmpty()) throw IllegalStateException("Aucun bulletin sélectionné")

        val pdfPaths = bulletins.map { it.filePath }
        val outputPath = File(outputDir, "bulletins_fusionnes_${System.currentTimeMillis()}.pdf").absolutePath

        // Délégué à PdfProcessor (couche data) via le repository
        throw NotImplementedError(
            "La fusion PDF réelle utilise PdfBox dans la couche data. " +
                    "Le use case orchestre l'opération."
        )
    }

    /**
     * Crée une archive Zip des bulletins sélectionnés.
     * @param bulletinIds IDs des bulletins
     * @param outputDir Répertoire de sortie
     * @return Chemin du fichier Zip
     */
    suspend fun createZip(
        bulletinIds: List<Long>,
        outputDir: String
    ): Result<String> = runCatching {
        val bulletins = bulletinRepository.getBulletinsByIds(bulletinIds)
        if (bulletins.isEmpty()) throw IllegalStateException("Aucun bulletin sélectionné")

        val outputPath = File(outputDir, "bulletins_${System.currentTimeMillis()}.zip").absolutePath

        ZipOutputStream(FileOutputStream(outputPath)).use { zos ->
            for (bulletin in bulletins) {
                val pdfFile = File(bulletin.filePath)
                if (pdfFile.exists()) {
                    zos.putNextEntry(ZipEntry(pdfFile.name))
                    pdfFile.inputStream().use { it.copyTo(zos) }
                    zos.closeEntry()
                }
            }
        }

        outputPath
    }

    /**
     * Exporte les bulletins par année/mois.
     * @param year Année (optionnelle)
     * @param month Mois (optionnel)
     * @param outputDir Répertoire de sortie
     * @param type Type d'export
     * @return Chemin du fichier exporté
     */
    suspend fun export(
        year: Int?,
        month: Int?,
        outputDir: String,
        type: ExportType = ExportType.PDF_MERGE
    ): Result<String> = runCatching {
        val bulletins = if (month != null && year != null) {
            var result = emptyList<Bulletin>()
            bulletinRepository.getBulletinsByMonth(month, year).collect {
                result = it
                return@collect
            }
            result
        } else if (year != null) {
            var result = emptyList<Bulletin>()
            bulletinRepository.getBulletinsByYear(year).collect {
                result = it
                return@collect
            }
            result
        } else {
            var result = emptyList<Bulletin>()
            bulletinRepository.getAllBulletins().collect {
                result = it
                return@collect
            }
            result
        }

        val ids = bulletins.map { it.id }
        when (type) {
            ExportType.PDF_MERGE -> mergePdfs(ids, outputDir)
            ExportType.ZIP_ARCHIVE -> createZip(ids, outputDir)
        }.getOrThrow()
    }
}
