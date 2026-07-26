package com.nka.bulletin.di

import android.content.Context
import com.nka.bulletin.data.local.secure.SecureStorageManager
import com.nka.bulletin.data.pdf.PdfProcessor
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object AppModule {

    @Provides
    @Singleton
    fun provideSecureStorageManager(
        @ApplicationContext context: Context
    ): SecureStorageManager = SecureStorageManager(context)

    @Provides
    @Singleton
    fun providePdfProcessor(
        @ApplicationContext context: Context
    ): PdfProcessor = PdfProcessor(context)
}
