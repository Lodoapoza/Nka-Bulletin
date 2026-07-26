package com.nka.bulletin.data.remote.mail

import android.content.Context
import com.google.api.client.googleapis.extensions.android.gms.auth.GoogleAccountCredential
import com.google.api.client.http.javanet.NetHttpTransport
import com.google.api.client.json.gson.GsonFactory
import com.google.api.services.gmail.Gmail
import com.google.api.services.gmail.GmailScopes
import com.google.api.services.gmail.model.ListMessagesResponse
import com.google.api.services.gmail.model.Message
import com.nka.bulletin.data.remote.auth.GoogleAuthManager
import com.nka.bulletin.domain.model.MailConfig
import com.nka.bulletin.domain.model.MailMessage
import dagger.hilt.android.qualifiers.ApplicationContext
import java.io.File
import java.io.FileOutputStream
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Implémentation Gmail via Google API Client Library.
 *
 * Filtres API :
 * - q="subject:paie has:attachment filename:pdf"
 * - Ne récupère QUE les métadonnées (pas le corps)
 *
 * Zero Trust : si une pièce jointe ne correspond pas aux critères,
 * elle est traitée en RAM puis effacée.
 */
@Singleton
class GmailProvider @Inject constructor(
    @ApplicationContext private val context: Context,
    private val googleAuthManager: GoogleAuthManager
) : MailProvider {

    private fun getGmailService(config: MailConfig): Gmail {
        val credential = GoogleAccountCredential.usingOAuth2(
            context,
            listOf(GmailScopes.GMAIL_READONLY)
        ).apply {
            selectedAccountName = config.email
        }

        return Gmail.Builder(
            NetHttpTransport(),
            GsonFactory.getDefaultInstance(),
            credential
        )
            .setApplicationName("Nka Bulletin")
            .build()
    }

    override suspend fun checkForMessages(
        config: MailConfig,
        sinceTimestamp: Long,
        filterSubject: String,
        requireAttachment: Boolean
    ): Result<List<MailMessage>> = runCatching {
        val service = getGmailService(config)
        val userId = "me"

        // Requête ciblée — pas de récupération complète de la boîte
        val query = buildString {
            append("subject:$filterSubject has:attachment")
            if (sinceTimestamp > 0) {
                append(" after:${sinceTimestamp / 1000}")
            }
            append(" filename:pdf")
        }

        val messagesResponse: ListMessagesResponse = service.users().messages()
            .list(userId)
            .setQ(query)
            .setMaxResults(20L) // Limiter le nombre de résultats
            .execute()

        val messages = messagesResponse.messages ?: return@runCatching emptyList()

        messages.mapNotNull { msg ->
            val fullMessage: Message = service.users().messages()
                .get(userId, msg.id)
                .setFormat("metadata") // Métadonnées uniquement, pas le corps
                .setMetadataHeaders(listOf("From", "Subject", "Date"))
                .execute()

            val headers = fullMessage.payload?.headers ?: return@mapNotNull null
            val subject = headers.find { it.name == "Subject" }?.value ?: ""
            val from = headers.find { it.name == "From" }?.value ?: ""
            val internalDate = fullMessage.internalDate ?: 0L

            // Vérifier si le message a des pièces jointes
            val hasAttachment = fullMessage.payload?.parts?.any { part ->
                part.filename?.isNotBlank() == true && part.filename?.lowercase()?.endsWith(".pdf") == true
            } ?: false

            // Trouver le nom de la pièce jointe PDF
            val attachmentName = fullMessage.payload?.parts
                ?.find { part ->
                    part.filename?.lowercase()?.endsWith(".pdf") == true
                }
                ?.filename

            if (!hasAttachment && requireAttachment) return@mapNotNull null

            MailMessage(
                id = msg.id,
                subject = subject,
                sender = from,
                receivedDate = internalDate,
                hasAttachment = hasAttachment,
                attachmentName = attachmentName
            )
        }
    }

    override suspend fun downloadAttachment(
        config: MailConfig,
        messageId: String,
        savePath: String
    ): Result<String> = runCatching {
        val service = getGmailService(config)
        val userId = "me"

        // Récupérer le message complet pour trouver l'ID de la pièce jointe
        val message = service.users().messages()
            .get(userId, messageId)
            .setFormat("full")
            .execute()

        // Trouver la pièce jointe PDF
        val attachmentPart = message.payload?.parts?.firstOrNull { part ->
            part.filename?.lowercase()?.endsWith(".pdf") == true
        } ?: throw IllegalStateException("Aucune pièce jointe PDF trouvée")

        val attachmentId = attachmentPart.body?.attachmentId
            ?: throw IllegalStateException("ID de pièce jointe introuvable")

        // Télécharger UNIQUEMENT la pièce jointe (pas le corps du message)
        val attachment = service.users().messages().attachments()
            .get(userId, messageId, attachmentId)
            .execute()

        val fileData = attachment.data ?: attachment.base64Data
            ?: throw IllegalStateException("Données de pièce jointe vides")

        // Décoder et sauvegarder
        val decodedBytes = if (fileData == attachment.data) {
            java.util.Base64.getUrlDecoder().decode(attachment.data)
        } else {
            java.util.Base64.getUrlDecoder().decode(attachment.base64Data)
        }

        FileOutputStream(File(savePath)).use { output ->
            output.write(decodedBytes)
        }

        savePath
    }
}
