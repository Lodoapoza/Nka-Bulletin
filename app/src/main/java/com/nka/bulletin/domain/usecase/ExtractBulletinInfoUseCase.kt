package com.nka.bulletin.domain.usecase

import javax.inject.Inject

/**
 * Informations extraites d'un bulletin PDF.
 */
data class ExtractedBulletinInfo(
    val employerName: String?,
    val grossSalary: Double?,
    val netSalary: Double?,
    val month: Int?,
    val year: Int?,
    val isGratification: Boolean,
    val pageCount: Int = 1
)

/**
 * Extrait les informations d'un bulletin de paie PDF.
 * Le parsing réel sera fait par PdfProcessor (couche data).
 *
 * Ce use case sert d'abstraction entre la couche domaine
 * et l'implémentation technique (PdfBox).
 */
class ExtractBulletinInfoUseCase @Inject constructor() {

    /**
     * Les implémentations concrètes dans la couche data
     * utiliseront PdfBox-Android pour l'extraction.
     *
     * @param pdfPath Chemin absolu du fichier PDF
     * @return Les informations extraites, ou échec
     */
    suspend operator fun invoke(pdfPath: String): Result<ExtractedBulletinInfo> = runCatching {
        // Délégué à PdfProcessor dans la couche data
        // Ce use case est un pont entre domain et data
        throw NotImplementedError(
            "L'extraction est déléguée à PdfProcessor dans la couche data. " +
                    "Le use case est injecté pour maintenir la clean architecture."
        )
    }
}
