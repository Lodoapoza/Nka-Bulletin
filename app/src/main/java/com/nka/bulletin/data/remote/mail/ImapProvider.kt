package com.nka.bulletin.data.remote.mail

import com.nka.bulletin.domain.model.MailConfig
import com.nka.bulletin.domain.model.MailMessage
import java.io.File
import java.io.FileOutputStream
import java.util.Properties
import javax.inject.Inject
import javax.inject.Singleton
import javax.mail.Folder
import javax.mail.Message
import javax.mail.Multipart
import javax.mail.Part
import javax.mail.Session
import javax.mail.Store
import javax.mail.internet.InternetAddress
import javax.mail.search.AndTerm
import javax.mail.search.ComparisonTerm
import javax.mail.search.FromStringTerm
import javax.mail.search.ReceivedDateTerm
import javax.mail.search.SearchTerm
import javax.mail.search.SubjectTerm

/**
 * Implémentation IMAP pour les fournisseurs mail autres que Gmail/Outlook.
 * Supporte les connexions SSL avec "Mot de passe d'application".
 *
 * Compatible : Orange, Free, SFR, Bouygues, Yahoo, etc.
 */
@Singleton
class ImapProvider @Inject constructor() : MailProvider {

    override suspend fun checkForMessages(
        config: MailConfig,
        sinceTimestamp: Long,
        filterSubject: String,
        requireAttachment: Boolean
    ): Result<List<MailMessage>> = runCatching {
        val store = connectImap(config)
        val inbox = store.getFolder("INBOX") as Folder
        inbox.open(Folder.READ_ONLY)

        try {
            // Construire les termes de recherche
            val terms = mutableListOf<SearchTerm>()
            terms.add(SubjectTerm(filterSubject))

            if (sinceTimestamp > 0) {
                terms.add(
                    ReceivedDateTerm(ComparisonTerm.GE, java.util.Date(sinceTimestamp))
                )
            }

            val searchTerm = if (terms.size > 1) {
                AndTerm(terms.toTypedArray())
            } else {
                terms.first()
            }

            val messages = inbox.search(searchTerm)

            messages.mapNotNull { msg ->
                // Vérifier la présence de pièce jointe
                val hasAttachment = hasAttachments(msg)
                if (requireAttachment && !hasAttachment) return@mapNotNull null

                val from = (msg.from?.firstOrNull() as? InternetAddress)?.address ?: ""
                val subject = msg.subject ?: ""
                val receivedDate = msg.receivedDate?.time ?: 0L
                val attachmentName = getAttachmentFileName(msg)

                MailMessage(
                    id = getMessageId(msg),
                    subject = subject,
                    sender = from,
                    receivedDate = receivedDate,
                    hasAttachment = hasAttachment,
                    attachmentName = attachmentName
                )
            }
        } finally {
            inbox.close(false)
            store.close()
        }
    }

    override suspend fun downloadAttachment(
        config: MailConfig,
        messageId: String,
        savePath: String
    ): Result<String> = runCatching {
        val store = connectImap(config)
        val inbox = store.getFolder("INBOX") as Folder
        inbox.open(Folder.READ_ONLY)

        try {
            val uidFolder = inbox as? com.sun.mail.imap.IMAPFolder
                ?: throw IllegalStateException("IMAPFolder requis")

            val message = uidFolder.getMessageByUID(messageId.toLong())
                ?: throw IllegalStateException("Message introuvable: $messageId")

            val content = message.content
            if (content is Multipart) {
                for (i in 0 until content.count) {
                    val part = content.getBodyPart(i)
                    val disposition = part.disposition
                    val fileName = part.fileName ?: ""

                    if (Part.ATTACHMENT.equals(disposition, ignoreCase = true) ||
                        (fileName.lowercase().endsWith(".pdf"))
                    ) {
                        val inputStream = part.inputStream
                        FileOutputStream(File(savePath)).use { output ->
                            inputStream.copyTo(output)
                        }
                        return@runCatching savePath
                    }
                }
            } else if (content is Part) {
                val inputStream = content.inputStream
                FileOutputStream(File(savePath)).use { output ->
                    inputStream.copyTo(output)
                }
                return@runCatching savePath
            }

            throw IllegalStateException("Aucune pièce jointe trouvée dans le message")
        } finally {
            inbox.close(false)
            store.close()
        }
    }

    private fun connectImap(config: MailConfig): Store {
        val props = Properties()
        props["mail.store.protocol"] = "imaps"
        props["mail.imaps.host"] = config.imapHost
        props["mail.imaps.port"] = (config.imapPort ?: 993).toString()
        props["mail.imaps.ssl"] = config.imapSsl.toString()
        props["mail.imaps.ssl.trust"] = "*" // Accepter tous les certificats (IMAP générique)
        props["mail.imaps.connectiontimeout"] = "15000"
        props["mail.imaps.timeout"] = "15000"

        val session = Session.getInstance(props)
        val store = session.getStore("imaps")
        store.connect(config.imapHost, config.imapPort ?: 993, config.email, config.token)
        return store
    }

    private fun hasAttachments(msg: Message): Boolean {
        return try {
            val content = msg.content
            if (content is Multipart) {
                (0 until content.count).any { i ->
                    val part = content.getBodyPart(i)
                    Part.ATTACHMENT.equals(part.disposition, ignoreCase = true)
                }
            } else false
        } catch (e: Exception) {
            false
        }
    }

    private fun getAttachmentFileName(msg: Message): String? {
        return try {
            val content = msg.content
            if (content is Multipart) {
                (0 until content.count).firstNotNullOfOrNull { i ->
                    val part = content.getBodyPart(i)
                    if (part.disposition?.equals(Part.ATTACHMENT, ignoreCase = true) == true) {
                        part.fileName
                    } else null
                }
            } else null
        } catch (e: Exception) {
            null
        }
    }

    private fun getMessageId(msg: Message): String {
        return try {
            val imapMsg = msg as? com.sun.mail.imap.IMAPMessage
            imapMsg?.messageID ?: msg.messageNumber.toString()
        } catch (e: Exception) {
            msg.messageNumber.toString()
        }
    }
}
