package com.nka.bulletin.domain.repository

import com.nka.bulletin.domain.model.MailConfig
import com.nka.bulletin.domain.model.MailMessage

/**
 * Interface repository pour les opérations mail.
 * Délègue au fournisseur approprié (Gmail, Outlook, IMAP).
 */
interface MailRepository {

    /**
     * Vérifie la présence de nouveaux bulletins dans la boîte mail.
     * @param config Configuration du compte mail
     * @param sinceTimestamp Timestamp des emails à partir duquel chercher
     * @return Liste des messages correspondant aux critères de bulletin
     */
    suspend fun checkForNewBulletins(
        config: MailConfig,
        sinceTimestamp: Long
    ): Result<List<MailMessage>>

    /**
     * Télécharge une pièce jointe depuis un message identifié.
     * @param config Configuration du compte mail
     * @param messageId ID du message
     * @param savePath Chemin de sauvegarde du fichier
     * @return Le chemin du fichier téléchargé
     */
    suspend fun downloadBulletin(
        config: MailConfig,
        messageId: String,
        savePath: String
    ): Result<String>

    /**
     * Teste la connexion au compte mail.
     */
    suspend fun testConnection(config: MailConfig): Result<Boolean>
}
