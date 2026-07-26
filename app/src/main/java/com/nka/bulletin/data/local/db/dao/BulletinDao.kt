package com.nka.bulletin.data.local.db.dao

import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update
import com.nka.bulletin.data.local.db.entity.BulletinEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface BulletinDao {

    @Query("SELECT * FROM bulletins ORDER BY year DESC, month DESC, download_date DESC")
    fun getAllBulletins(): Flow<List<BulletinEntity>>

    @Query("SELECT * FROM bulletins WHERE id = :id")
    suspend fun getBulletinById(id: Long): BulletinEntity?

    @Query("SELECT * FROM bulletins WHERE id IN (:ids) ORDER BY year DESC, month DESC")
    suspend fun getBulletinsByIds(ids: List<Long>): List<BulletinEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertBulletin(bulletin: BulletinEntity): Long

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertBulletins(bulletins: List<BulletinEntity>): List<Long>

    @Update
    suspend fun updateBulletin(bulletin: BulletinEntity)

    @Delete
    suspend fun deleteBulletin(bulletin: BulletinEntity)

    @Query("DELETE FROM bulletins WHERE id = :id")
    suspend fun deleteBulletinById(id: Long)

    @Query("DELETE FROM bulletins")
    suspend fun deleteAll()

    @Query(
        """
        SELECT * FROM bulletins 
        WHERE file_name LIKE '%' || :query || '%' 
        OR employer_name LIKE '%' || :query || '%'
        ORDER BY year DESC, month DESC
        """
    )
    fun searchBulletins(query: String): Flow<List<BulletinEntity>>

    @Query("SELECT * FROM bulletins WHERE month = :month AND year = :year ORDER BY download_date DESC")
    fun getBulletinsByMonth(month: Int, year: Int): Flow<List<BulletinEntity>>

    @Query("SELECT * FROM bulletins WHERE year = :year ORDER BY month DESC, download_date DESC")
    fun getBulletinsByYear(year: Int): Flow<List<BulletinEntity>>

    @Query("SELECT COUNT(*) FROM bulletins")
    suspend fun count(): Int

    @Query("SELECT DISTINCT year FROM bulletins ORDER BY year DESC")
    suspend fun getAvailableYears(): List<Int>

    @Query("SELECT * FROM bulletins ORDER BY download_date DESC LIMIT :limit")
    fun getRecentBulletins(limit: Int): Flow<List<BulletinEntity>>
}
