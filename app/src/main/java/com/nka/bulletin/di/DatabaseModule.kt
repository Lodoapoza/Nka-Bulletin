package com.nka.bulletin.di

import android.content.Context
import com.nka.bulletin.data.local.db.NkaDatabase
import com.nka.bulletin.data.local.db.dao.BulletinDao
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object DatabaseModule {

    @Provides
    @Singleton
    fun provideDatabase(
        @ApplicationContext context: Context
    ): NkaDatabase = NkaDatabase.create(context)

    @Provides
    @Singleton
    fun provideBulletinDao(
        database: NkaDatabase
    ): BulletinDao = database.bulletinDao()
}
