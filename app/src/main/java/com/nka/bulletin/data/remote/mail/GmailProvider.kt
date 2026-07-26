package com.nka.bulletin.data.remote.mail

import android.content.Context
import com.nka.bulletin.data.remote.auth.GoogleAuthManager
import com.nka.bulletin.domain.model.MailConfig
import com.nka.bulletin.domain.model.MailMessage
import dagger.hilt.android.qualifiers.ApplicationContext
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
 * Implémentation Gmail via REST API directe (OkHttp).
 * Évite les problèmes de dépendances Google API Client sur Maven Central.
 */
@Singleton
class GmailProvider @Inject constructor(
    @ApplicationContext private val context: Context,
    private val googleAuthManager: GoogleAuthManager
) : MailProvider {

    private val client = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build()

    companion object {
        private const val GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me"
    }

    override suspend fun checkForMessages(
        config: MailConfig,
        sinceTimestamp: Long,
        filterSubject: String,
        requireAttachment: Boolean
    ): Result<List<MailMessage>> = runCatching {
        val token = config.token ?: throw IllegalStateException("Token Gmail manquant")

        val query = buildString {
            append("subject:$filterSubject has:attachment")
            if (sinceTimestamp > 0) {
                append(" after:${sinceTimestamp / 1000}")
            }
            append(" filename:pdf")
        }

        val url = "$GMAIL_API_BASE/messages?q=${java.net.URLEncoder.encode(query, "UTF-8")}&maxResults=20"
        val request = Request.Builder()
            .url(url)
            .header("Authorization", "Bearer $token")
            .build()

        val response = client.newCall(request).execute()
        val body = JSONObject(response.body?.string() ?: "{}")
        val messages = body.optJSONArray("messages") ?: JSONArray()

        val mailMessages = mutableListOf<MailMessage>()

        for (i in 0 until messages.length()) {
            val msgRef = messages.getJSONObject(i)
            val msgId = msgRef.getString("id")

            val detailUrl = "$GMAIL_API_BASE/messages/$msgId?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date"
            val detailReq = Request.Builder()
                .url(detailUrl)
                .header("Authorization", "Bearer $token")
                .build()

            val detailResp = client.newCall(detailReq).execute()
            val detailBody = JSONObject(detailResp.body?.string() ?: "{}")
            val payload = detailBody.optJSONObject("payload")
            val headers = payload?.optJSONArray("headers") ?: JSONArray()

            var subject = ""
            var sender = ""
            for (h in 0 until headers.length()) {
                val header = headers.getJSONObject(h)
                if (header.optString("name") == "Subject") subject = header.optString("value")
                if (header.optString("name") == "From") sender = header.optString("value")
            }

            val internalDate = detailBody.optLong("internalDate", 0L)

            var hasAttachment = false
            var attachmentName: String? = null

            val parts = payload?.optJSONArray("parts")
            if (parts != null) {
                for (p in 0 until parts.length()) {
                    val part = parts.getJSONObject(p)
                    val filename = part.optString("filename", "")
                    if (filename.lowercase().endsWith(".pdf")) {
                        hasAttachment = true
                        attachmentName = filename
                        break
                    }
                }
            }

            if (!hasAttachment && requireAttachment) continue

            mailMessages.add(
                MailMessage(
                    id = msgId,
                    subject = subject,
                    sender = sender,
                    receivedDate = internalDate,
                    hasAttachment = hasAttachment,
                    attachmentName = attachmentName
                )
            )
        }

        mailMessages
    }

    override suspend fun downloadAttachment(
        config: MailConfig,
        messageId: String,
        savePath: String
    ): Result<String> = runCatching {
        val token = config.token ?: throw IllegalStateException("Token Gmail manquant")

        val url = "$GMAIL_API_BASE/messages/$messageId?format=full"
        val request = Request.Builder()
            .url(url)
            .header("Authorization", "Bearer $token")
            .build()

        val response = client.newCall(request).execute()
        val body = JSONObject(response.body?.string() ?: "{}")
        val payload = body.optJSONObject("payload")
        val parts = payload?.optJSONArray("parts") ?: JSONArray()

        var attachmentId: String? = null
        for (i in 0 until parts.length()) {
            val part = parts.getJSONObject(i)
            val filename = part.optString("filename", "")
            if (filename.lowercase().endsWith(".pdf")) {
                val bodyObj = part.optJSONObject("body")
                attachmentId = bodyObj?.optString("attachmentId")
                break
            }
        }

        if (attachmentId == null) {
            throw IllegalStateException("Aucune pièce jointe PDF trouvée")
        }

        val attUrl = "$GMAIL_API_BASE/messages/$messageId/attachments/$attachmentId"
        val attReq = Request.Builder()
            .url(attUrl)
            .header("Authorization", "Bearer $token")
            .build()

        val attResp = client.newCall(attReq).execute()
        val attBody = JSONObject(attResp.body?.string() ?: "{}")
        val data = attBody.optString("data")

        val decodedBytes = java.util.Base64.getUrlDecoder().decode(data)
        FileOutputStream(File(savePath)).use { output ->
            output.write(decodedBytes)
        }

        savePath
    }
}
