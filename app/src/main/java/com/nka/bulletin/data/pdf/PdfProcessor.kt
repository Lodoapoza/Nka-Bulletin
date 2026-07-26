package com.nka.bulletin.data.pdf

import android.content.Context
import com.nka.bulletin.domain.usecase.ExtractedBulletinInfo
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Processeur PDF utilisant PdfBox-Android.
 *
 * Responsabilités :
 * 1. Extraction de texte de la 1ère page (parsing regex)
 * 2. Fusion de plusieurs PDFs en un seul
 * 3. Comptage de pages
 * 4. Création d'archives Zip
 *
 * Toutes les opérations lourdes sont sur Dispatchers.IO.
 */
@Singleton
class PdfProcessor @Inject constructor(
    @ApplicationContext private val context: Context
) {

    /**
     * Extrait les informations d'un bulletin PDF.
     * Parcourt le texte de la 1ère page avec des regex
     * pour trouver Prénom, Nom, Matricule, Salaire.
     */
    suspend fun extractBulletinInfo(pdfPath: String): Result<ExtractedBulletinInfo> =
        withContext(Dispatchers.IO) {
            runCatching {
                val file = File(pdfPath)
                if (!file.exists()) {
                    throw IllegalStateException("Fichier introuvable: $pdfPath")
                }

                val document = org.apache.pdfbox.pdmodel.PDDocument.load(file)
                try {
                    val stripper = org.apache.pdfbox.text.PDFTextStripper()
                    stripper.startPage = 1
                    stripper.endPage = 1
                    val pageText = stripper.getText(document)
                    val pageCount = document.numberOfPages

                    parseBulletinText(pageText, pageCount)
                } finally {
                    document.close()
                }
            }
        }

    /**
     * Fusionne plusieurs PDFs en un seul document.
     */
    suspend fun mergePdfs(pdfPaths: List<String>, outputPath: String): Result<String> =
        withContext(Dispatchers.IO) {
            runCatching {
                val merged = org.apache.pdfbox.pdmodel.PDDocument()

                try {
                    for (path in pdfPaths) {
                        val doc = org.apache.pdfbox.pdmodel.PDDocument.load(File(path))
                        try {
                            for (i in 0 until doc.numberOfPages) {
                                merged.addPage(doc.getPage(i))
                            }
                        } finally {
                            doc.close()
                        }
                    }
                    merged.save(File(outputPath))
                    outputPath
                } finally {
                    merged.close()
                }
            }
        }

    /**
     * Compte le nombre de pages d'un PDF.
     */
    fun getPageCount(pdfPath: String): Int {
        return try {
            val doc = org.apache.pdfbox.pdmodel.PDDocument.load(File(pdfPath))
            val count = doc.numberOfPages
            doc.close()
            count
        } catch (e: Exception) {
            1
        }
    }

    /**
     * Crée une archive Zip contenant les PDFs spécifiés.
     */
    suspend fun createZip(pdfPaths: List<String>, outputPath: String): Result<String> =
        withContext(Dispatchers.IO) {
            runCatching {
                ZipOutputStream(FileOutputStream(File(outputPath))).use { zos ->
                    for (path in pdfPaths) {
                        val pdfFile = File(path)
                        if (pdfFile.exists()) {
                            zos.putNextEntry(ZipEntry(pdfFile.name))
                            pdfFile.inputStream().use { input ->
                                input.copyTo(zos)
                            }
                            zos.closeEntry()
                        }
                    }
                }
                outputPath
            }
        }

    // --- Parsing du texte du bulletin ---

    private val NOM_REGEX = Regex(
        "(?:NOM\\s*:?\\s*|Nom\\s*:?\\s*|NOM\\s*ET\\s*PRÉNOMS?\\s*:?\\s*)([A-ZÀ-ÖØ-Þ\\s-]+)",
        RegexOption.IGNORE_CASE
    )

    private val PRENOM_REGEX = Regex(
        "(?:PRÉNOM\\s*:?\\s*|Prénom\\s*:?\\s*|PRENOM\\s*:?\\s*)([A-ZÀ-ÖØ-Þ\\s-]+)",
        RegexOption.IGNORE_CASE
    )

    private val MATRICULE_REGEX = Regex(
        "(?:MATRICULE\\s*:?\\s*|Matricule\\s*:?\\s*|N°\\s*?\\s*MATRICULE\\s*:?\\s*)([\\w\\d]+)",
        RegexOption.IGNORE_CASE
    )

    private val SALAIRE_BRUT_REGEX = Regex(
        "(?:SALAIRE\\s*BRUT|SALAIRE\\s*DE\\s*BASE|BRUT)\\s*:?\\s*([\\d\\s.,]+)\\s*(?:€|EUR|FCFA)?",
        RegexOption.IGNORE_CASE
    )

    private val SALAIRE_NET_REGEX = Regex(
        "(?:SALAIRE\\s*NET|NET\\s*À\\s*PAYER|NET\\s*PAYÉ|SALAIRE\\s*NET\\s*PAYÉ)\\s*:?\\s*([\\d\\s.,]+)\\s*(?:€|EUR|FCFA)?",
        RegexOption.IGNORE_CASE
    )

    private val GRATIFICATION_REGEX = Regex(
        "(?:GRATIFICATION|PRIME\\s*DE\\s*FIN\\s*D'ANNÉE|13ÈME|13EME|PRIME)",
        RegexOption.IGNORE_CASE
    )

    /**
     * Parse le texte extrait de la 1ère page du PDF.
     */
    private fun parseBulletinText(text: String, pageCount: Int): ExtractedBulletinInfo {
        val nom = NOM_REGEX.find(text)?.groupValues?.getOrNull(1)?.trim()
        val prenom = PRENOM_REGEX.find(text)?.groupValues?.getOrNull(1)?.trim()
        val matricule = MATRICULE_REGEX.find(text)?.groupValues?.getOrNull(1)?.trim()
        val salaireBrut = parseMoney(SALAIRE_BRUT_REGEX.find(text)?.groupValues?.getOrNull(1))
        val salaireNet = parseMoney(SALAIRE_NET_REGEX.find(text)?.groupValues?.getOrNull(1))
        val isGratification = GRATIFICATION_REGEX.containsMatchIn(text)

        // Employer name = trimmed from "NOM PRENOM" context
        val employerName = listOfNotNull(nom, prenom, matricule)
            .filter { it.isNotBlank() }
            .joinToString(" ")
            .ifBlank { null }

        return ExtractedBulletinInfo(
            employerName = employerName,
            grossSalary = salaireBrut,
            netSalary = salaireNet,
            month = null,  // Sera extrait du nom du fichier
            year = null,   // Sera extrait du nom du fichier
            isGratification = isGratification,
            pageCount = pageCount
        )
    }

    /**
     * Parse un montant écrit en français.
     * Gère les formats : "1 234,56", "1234.56", "1234,56"
     */
    private fun parseMoney(value: String?): Double? {
        if (value == null) return null
        return try {
            value
                .trim()
                .replace("\\s".toRegex(), "")  // Enlever les espaces
                .replace(",", ".")               // Normaliser la décimale
                .toDoubleOrNull()
        } catch (e: Exception) {
            null
        }
    }
}
