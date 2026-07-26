package com.nka.bulletin.di

import com.nka.bulletin.data.remote.mail.GmailProvider
import com.nka.bulletin.data.remote.mail.ImapProvider
import com.nka.bulletin.data.remote.mail.OutlookProvider
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

/**
 * Module Hilt pour les providers mail.
 * Note : GmailProvider, OutlookProvider et ImapProvider ont déjà @Inject constructor,
 * donc Hilt peut les résoudre automatiquement sans @Provides.
 *
 * Ce module sert de documentation et de point d'extension si nécessaire.
 */
@Module
@InstallIn(SingletonComponent::class)
object MailModule {
    // Les providers sont injectés automatiquement via @Inject constructor
    // Pas besoin de @Provides — Hilt les résout grâce à l'annotation @Inject
    // sur leurs constructeurs respectifs.
}
