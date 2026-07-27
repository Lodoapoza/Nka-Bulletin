package com.nka.bulletin.di

import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent

/**
 * Module Hilt racine.
 * SecureStorageManager et PdfProcessor sont injectés automatiquement
 * via leurs @Inject constructor + @Singleton.
 */
@Module
@InstallIn(SingletonComponent::class)
object AppModule {
    // Les classes avec @Inject constructor sont résolues automatiquement par Hilt.
    // Pas besoin de @Provides.
}
