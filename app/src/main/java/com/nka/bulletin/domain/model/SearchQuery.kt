package com.nka.bulletin.domain.model

/**
 * Requête de recherche parsée.
 * Résultat du parsing d'une requête naturelle comme "Mars 2024", "Juin", "2023".
 */
data class SearchQuery(
    val originalQuery: String,
    val month: Int?, // null si non spécifié
    val year: Int?,
    val text: String? // texte libre (nom employeur, etc.)
) {
    companion object {
        /**
         * Mois en français pour le parsing.
         */
        private val MONTH_MAP = mapOf(
            "janvier" to 1, "janv" to 1, "jan" to 1,
            "février" to 2, "fevrier" to 2, "fev" to 2, "fév" to 2,
            "mars" to 3, "mar" to 3,
            "avril" to 4, "avr" to 4,
            "mai" to 5,
            "juin" to 6,
            "juillet" to 7, "juil" to 7, "jul" to 7,
            "août" to 8, "aout" to 8, "aoû" to 8,
            "septembre" to 9, "sept" to 9, "sep" to 9,
            "octobre" to 10, "oct" to 10,
            "novembre" to 11, "nov" to 11,
            "décembre" to 12, "decembre" to 12, "dec" to 12, "déc" to 12
        )

        private val YEAR_REGEX = Regex("\\b(19\\d{2}|20\\d{2})\\b")

        /**
         * Parse une requête textuelle en SearchQuery structurée.
         * Exemples : "Mars 2024" → month=3, year=2024
         *            "Juin" → month=6
         *            "2023" → year=2023
         *            "Dupont" → text="Dupont"
         */
        fun parse(query: String): SearchQuery {
            val lowerQuery = query.lowercase().trim()
            var month: Int? = null
            var year: Int? = null
            var text: String? = null

            // Chercher le mois
            for ((key, value) in MONTH_MAP) {
                if (lowerQuery.contains(key)) {
                    month = value
                    break
                }
            }

            // Chercher l'année
            val yearMatch = YEAR_REGEX.find(lowerQuery)
            if (yearMatch != null) {
                year = yearMatch.value.toInt()
            }

            // Si ni mois ni année, tout le texte est une recherche libre
            if (month == null && year == null && lowerQuery.isNotBlank()) {
                text = query.trim()
            }

            return SearchQuery(
                originalQuery = query,
                month = month,
                year = year,
                text = text
            )
        }
    }
}
