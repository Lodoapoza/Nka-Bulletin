package com.nka.bulletin.data.repository

import com.nka.bulletin.data.remote.mail.GmailProvider
import com.nka.bulletin.data.remote.mail.ImapProvider
import com.nka.bulletin.data.remote.mail.MailProvider
import com.nka.bulletin.data.remote.mail.OutlookProvider
import com.nka.bulletin.domain.model.MailConfig
import com.nka.bulletin.domain.model.MailMessage
import com.nka.bulletin.domain.model.MailProviderType
import com.nka.bulletin.domain.repository.MailRepository
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class MailRepositoryImpl @Inject constructor(
    private val gmailProvider: GmailProvider,
    private val outlookProvider: OutlookProvider,
    private val imapProvider: ImapProvider
) : MailRepository {

    /**
     * Sélectionne le provider approprié selon le type de configuration.
     */
    private fun getProvider(config: MailConfig): MailProvider {
        return when (config.provider) {
            MailProviderType.GMAIL -> gmailProvider
            MailProviderType.OUTLOOK -> outlookProvider
            MailProviderType.IMAP -> imapProvider
        }
    }

    override suspend fun checkForNewBulletins(
        config: MailConfig,
        sinceTimestamp: Long
    ): Result<List<MailMessage>> {
        val provider = getProvider(config)
        val result = provider.checkForMessages(
            config = config,
            sinceTimestamp = sinceTimestamp,
            filterSubject = "paie",
            requireAttachment = true
        )

        // Zero Trust : filtrer uniquement les candidats bulletins
        return result.map { messages ->
            messages.filter { it.isBulletinCandidate() }
        }
    }

    override suspend fun downloadBulletin(
        config: MailConfig,
        messageId: String,
        savePath: String
    ): Result<String> {
        val provider = getProvider(config)
        return provider.downloadAttachment(config, messageId, savePath)
    }

    override suspend fun testConnection(config: MailConfig): Result<Boolean> {
        return runCatching {
            val provider = getProvider(config)
            val result = provider.checkForMessages(
                config = config,
                sinceTimestamp = System.currentTimeMillis(),
                filterSubject = "test",
                requireAttachment = false
            )
            result.isSuccess
        }
    }
}
