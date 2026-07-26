package com.nka.bulletin.di

import android.content.Context
import com.nka.bulletin.data.local.secure.SecureStorageManager
import com.nka.bulletin.data.remote.auth.GoogleAuthManager
import com.nka.bulletin.data.remote.auth.MicrosoftAuthManager
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object AuthModule {

    @Provides
    @Singleton
    fun provideGoogleAuthManager(
        @ApplicationContext context: Context,
        secureStorage: SecureStorageManager
    ): GoogleAuthManager = GoogleAuthManager(context, secureStorage)

    @Provides
    @Singleton
    fun provideMicrosoftAuthManager(
        @ApplicationContext context: Context,
        secureStorage: SecureStorageManager
    ): MicrosoftAuthManager = MicrosoftAuthManager(context, secureStorage)
}
