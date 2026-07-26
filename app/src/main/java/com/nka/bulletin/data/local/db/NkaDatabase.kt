package com.nka.bulletin.data.local.db

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.TypeConverters
import com.nka.bulletin.data.local.db.dao.BulletinDao
import com.nka.bulletin.data.local.db.entity.BulletinEntity

@Database(
    entities = [BulletinEntity::class],
    version = 1,
    exportSchema = false
)
abstract class NkaDatabase : RoomDatabase() {

    abstract fun bulletinDao(): BulletinDao

    companion object {
        const val DATABASE_NAME = "nka_bulletin.db"

        @Volatile
        private var INSTANCE: NkaDatabase? = null

        fun create(context: Context): NkaDatabase {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: Room.databaseBuilder(
                    context.applicationContext,
                    NkaDatabase::class.java,
                    DATABASE_NAME
                )
                    .fallbackToDestructiveMigration()
                    .build()
                    .also { INSTANCE = it }
            }
        }
    }
}
