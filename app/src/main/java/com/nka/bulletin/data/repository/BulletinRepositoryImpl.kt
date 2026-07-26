package com.nka.bulletin.data.repository

import com.nka.bulletin.data.local.db.dao.BulletinDao
import com.nka.bulletin.data.local.db.entity.BulletinEntity
import com.nka.bulletin.data.pdf.PdfProcessor
import com.nka.bulletin.domain.model.Bulletin
import com.nka.bulletin.domain.repository.BulletinRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class BulletinRepositoryImpl @Inject constructor(
    private val bulletinDao: BulletinDao,
    private val pdfProcessor: PdfProcessor
) : BulletinRepository {

    override fun getAllBulletins(): Flow<List<Bulletin>> {
        return bulletinDao.getAllBulletins().map { entities ->
            entities.map { it.toDomainModel() }
        }
    }

    override suspend fun getBulletinById(id: Long): Bulletin? {
        return bulletinDao.getBulletinById(id)?.toDomainModel()
    }

    override suspend fun insertBulletin(bulletin: Bulletin): Long {
        return bulletinDao.insertBulletin(BulletinEntity.fromDomainModel(bulletin))
    }

    override suspend fun updateBulletin(bulletin: Bulletin) {
        bulletinDao.updateBulletin(BulletinEntity.fromDomainModel(bulletin))
    }

    override suspend fun deleteBulletin(id: Long) {
        bulletinDao.deleteBulletinById(id)
    }

    override suspend fun deleteAll() {
        bulletinDao.deleteAll()
    }

    override fun searchBulletins(query: String): Flow<List<Bulletin>> {
        return bulletinDao.searchBulletins(query).map { entities ->
            entities.map { it.toDomainModel() }
        }
    }

    override fun getBulletinsByMonth(month: Int, year: Int): Flow<List<Bulletin>> {
        return bulletinDao.getBulletinsByMonth(month, year).map { entities ->
            entities.map { it.toDomainModel() }
        }
    }

    override fun getBulletinsByYear(year: Int): Flow<List<Bulletin>> {
        return bulletinDao.getBulletinsByYear(year).map { entities ->
            entities.map { it.toDomainModel() }
        }
    }

    override suspend fun getBulletinsByIds(ids: List<Long>): List<Bulletin> {
        return bulletinDao.getBulletinsByIds(ids).map { it.toDomainModel() }
    }

    override suspend fun count(): Int {
        return bulletinDao.count()
    }

    override suspend fun getAvailableYears(): List<Int> {
        return bulletinDao.getAvailableYears()
    }
}
