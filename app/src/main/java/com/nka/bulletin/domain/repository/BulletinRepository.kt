package com.nka.bulletin.domain.repository

import com.nka.bulletin.domain.model.Bulletin
import kotlinx.coroutines.flow.Flow

/**
 * Interface repository pour les bulletins de paie.
 * Les implémentations concrètes gèrent Room DB + stockage fichier.
 */
interface BulletinRepository {

    fun getAllBulletins(): Flow<List<Bulletin>>

    suspend fun getBulletinById(id: Long): Bulletin?

    suspend fun insertBulletin(bulletin: Bulletin): Long

    suspend fun updateBulletin(bulletin: Bulletin)

    suspend fun deleteBulletin(id: Long)

    suspend fun deleteAll()

    /**
     * Recherche textuelle sur fileName et employerName.
     */
    fun searchBulletins(query: String): Flow<List<Bulletin>>

    fun getBulletinsByMonth(month: Int, year: Int): Flow<List<Bulletin>>

    fun getBulletinsByYear(year: Int): Flow<List<Bulletin>>

    suspend fun getBulletinsByIds(ids: List<Long>): List<Bulletin>

    suspend fun count(): Int

    /**
     * Récupère la liste des années disponibles.
     */
    suspend fun getAvailableYears(): List<Int>
}
