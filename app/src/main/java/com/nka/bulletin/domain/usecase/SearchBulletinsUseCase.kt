package com.nka.bulletin.domain.usecase

import com.nka.bulletin.domain.model.Bulletin
import com.nka.bulletin.domain.model.SearchQuery
import com.nka.bulletin.domain.repository.BulletinRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emptyFlow
import javax.inject.Inject

/**
 * Recherche de bulletins avec parsing de requête naturelle.
 * Supporte : "Mars 2024", "Juin", "2023", "Dupont", etc.
 */
class SearchBulletinsUseCase @Inject constructor(
    private val bulletinRepository: BulletinRepository
) {

    /**
     * Parse une requête naturelle et retourne les résultats filtrés.
     */
    suspend operator fun invoke(query: String): Flow<List<Bulletin>> {
        if (query.isBlank()) {
            return bulletinRepository.getAllBulletins()
        }

        val parsed = SearchQuery.parse(query)

        return when {
            parsed.month != null && parsed.year != null -> {
                // "Mars 2024" → filtrer par mois + année
                bulletinRepository.getBulletinsByMonth(parsed.month, parsed.year)
            }
            parsed.year != null -> {
                // "2024" → toutes l'année
                bulletinRepository.getBulletinsByYear(parsed.year)
            }
            parsed.month != null -> {
                // "Juin" → tous les Juin (toutes années)
                // On utilise la recherche textuelle étendue
                bulletinRepository.searchBulletins(parsed.originalQuery)
            }
            else -> {
                // Recherche textuelle libre
                bulletinRepository.searchBulletins(query)
            }
        }
    }

    /**
     * Parse uniquement la requête (sans exécuter la recherche).
     * Utile pour l'affichage des suggestions.
     */
    fun parseQuery(query: String): SearchQuery {
        return SearchQuery.parse(query)
    }
}
