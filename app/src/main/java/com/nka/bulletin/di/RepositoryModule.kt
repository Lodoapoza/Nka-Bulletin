package com.nka.bulletin.di

import com.nka.bulletin.data.repository.AuthRepositoryImpl
import com.nka.bulletin.data.repository.BulletinRepositoryImpl
import com.nka.bulletin.data.repository.MailRepositoryImpl
import com.nka.bulletin.domain.repository.AuthRepository
import com.nka.bulletin.domain.repository.BulletinRepository
import com.nka.bulletin.domain.repository.MailRepository
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
abstract class RepositoryModule {

    @Binds
    @Singleton
    abstract fun bindBulletinRepository(
        impl: BulletinRepositoryImpl
    ): BulletinRepository

    @Binds
    @Singleton
    abstract fun bindAuthRepository(
        impl: AuthRepositoryImpl
    ): AuthRepository

    @Binds
    @Singleton
    abstract fun bindMailRepository(
        impl: MailRepositoryImpl
    ): MailRepository
}
