package com.nka.bulletin.domain.model

/**
 * Modèle domaine représentant un bulletin de paie.
 * Couche pure Kotlin — sans dépendance Android.
 */
data class Bulletin(
    val id: Long = 0,
    val fileName: String,
    val filePath: String,
    val month: Int, // 1-12
    val year: Int,
    val employerName: String?,
    val grossSalary: Double?,
    val netSalary: Double?,
    val downloadDate: Long, // System.currentTimeMillis()
    val mailSource: String, // email expéditeur
    val isGratification: Boolean = false,
    val isMerged: Boolean = false,
    val pageCount: Int = 1
) {
    /**
     * Nom lisible du mois en français.
     */
    val monthName: String
        get() = when (month) {
            1 -> "Janvier"
            2 -> "Février"
            3 -> "Mars"
            4 -> "Avril"
            5 -> "Mai"
            6 -> "Juin"
            7 -> "Juillet"
            8 -> "Août"
            9 -> "Septembre"
            10 -> "Octobre"
            11 -> "Novembre"
            12 -> "Décembre"
            else -> "Inconnu"
        }

    /**
     * Libellé complet : "Janvier 2024"
     */
    val displayLabel: String
        get() = "$monthName $year"

    /**
     * Type de bulletin affichable.
     */
    val typeLabel: String
        get() = if (isGratification) "Gratification / Prime" else "Bulletin normal"
}
