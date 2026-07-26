package com.nka.bulletin.data.remote.mail

import com.nka.bulletin.data.remote.auth.MicrosoftAuthManager
import com.nka.bulletin.domain.model.MailConfig
import com.nka.bulletin.domain.model.MailMessage
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Implémentation Outlook/Exchange via Microsoft Graph API.
 *
 * Endpoint : GET /me/messages
 * Filtre : $search="paie" AND hasAttachments=true
 *
 * Zero Trust : uniquement les métadonnées, puis téléchargement ciblé
 * de la pièce jointe via /me/messages/{id}/attachments/{id}/$value
 */
@Singleton
class OutlookProvider @Inject constructor(
    private val microsoftAuthManager: MicrosoftAuthManager
) : MailProvider {

    private val client = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build()

    companion object {
        private const val GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0"
    }

    override suspend fun checkForMessages(
        config: MailConfig,
        sinceTimestamp: Long,
        filterSubject: String,
        requireAttachment: Boolean
    ): Result<List<MailMessage>> = runCatching {
        val token = config.token ?: throw IllegalStateException("Token manquant")

        // Requête filtrée — pas de récupération de toute la boîte
        val searchQuery = "\"$filterSubject\""
        val filterQuery = "receivedDateTime ge ${isoTimestamp(sinceTimestamp)}"
        val url = "$GRAPH_BASE_URL/me/messages?" +
                "\$search=$searchQuery&" +
                "\$filter=$filterQuery&" +
                "\$select=id,subject,from,receivedDateTime,hasAttachments&" +
                "\$top=20" +
                (if (requireAttachment) "&\$filter=hasAttachments eq true" else "")

        val request = Request.Builder()
            .url(url)
            .header("Authorization", "Bearer $token")
            .build()

        val response = client.newCall(request).execute()
        val body = JSONObject(response.body?.string() ?: "{}")
        val messages = body.getJSONArray("value")

        (0 until messages.length()).map { i ->
            val msg = messages.getJSONObject(i)
            val fromObj = msg.optJSONObject("from")?.optJSONObject("emailAddress")
            val fromEmail = fromObj?.optString("address") ?: ""

            MailMessage(
                id = msg.getString("id"),
                subject = msg.optString("subject", ""),
                sender = fromEmail,
                receivedDate = parseIsoDate(msg.optString("receivedDateTime", "")),
                hasAttachment = msg.optBoolean("hasAttachments", false),
                attachmentName = null // Nécessite un appel supplémentaire pour obtenir le nom
            )
        }
    }

    override suspend fun downloadAttachment(
        config: MailConfig,
        messageId: String,
        savePath: String
    ): Result<String> = runCatching {
        val token = config.token ?: throw IllegalStateException("Token manquant")

        // D'abord, récupérer les métadonnées des pièces jointes
        val attachmentsUrl = "$GRAPH_BASE_URL/me/messages/$messageId/attachments"
        val attachmentsRequest = Request.Builder()
            .url(attachmentsUrl)
            .header("Authorization", "Bearer $token")
            .build()

        val attachmentsResponse = client.newCall(attachmentsRequest).execute()
        val attachmentsBody = JSONObject(attachmentsResponse.body?.string() ?: "{}")
        val attachments = attachmentsBody.getJSONArray("value")

        // Trouver la première pièce jointe PDF
        for (i in 0 until attachments.length()) {
            val attachment = attachments.getJSONObject(i)
            val name = attachment.optString("name", "")
            if (name.lowercase().endsWith(".pdf")) {
                // Télécharger le contenu
                val contentBytes: ByteArray = if (attachment.has("contentBytes")) {
                    java.util.Base64.getDecoder().decode(attachment.getString("contentBytes"))
                } else {
                    // Télécharger via le endpoint $value
                    val downloadUrl = "$GRAPH_BASE_URL/me/messages/$messageId/attachments/${attachment.getString("id")}/\$value"
                    val downloadRequest = Request.Builder()
                        .url(downloadUrl)
                        .header("Authorization", "Bearer $token")
                        .build()
                    val downloadResponse = client.newCall(downloadRequest).execute()
                    downloadResponse.body?.bytes()
                        ?: throw IllegalStateException("Contenu vide")
                }

                FileOutputStream(File(savePath)).use { output ->
                    output.write(contentBytes)
                }
                return@runCatching savePath
            }
        }

        throw IllegalStateException("Aucune pièce jointe PDF trouvée")
    }

    private fun isoTimestamp(timestamp: Long): String {
        val sdf = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", java.util.Locale.US)
        sdf.timeZone = java.util.TimeZone.getTimeZone("UTC")
        return sdf.format(java.util.Date(timestamp))
    }

    private fun parseIsoDate(isoDate: String): Long {
        return try {
            val sdf = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", java.util.Locale.US)
            sdf.timeZone = java.util.TimeZone.getTimeZone("UTC")
            sdf.parse(isoDate.replace("Z", "+0000"))?.time ?: 0L
        } catch (e: Exception) {
            0L
        }
    }
}
