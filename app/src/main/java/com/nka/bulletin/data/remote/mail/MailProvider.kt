package com.nka.bulletin.data.remote.mail

import com.nka.bulletin.domain.model.MailConfig
import com.nka.bulletin.domain.model.MailMessage

/**
 * Interface commune à tous les fournisseurs de messagerie.
 * Chaque implémentation (Gmail, Outlook, IMAP) suit ce contrat.
 *
 * Principes :
 * - Requêtes ciblées : filtres stricts sur sujet + pièce jointe
 * - Extraction chirurgicale : ignorer le corps, ne cibler que la pièce jointe
 * - Zero Trust : données non requises traitées en mémoire et détruites
 */
interface MailProvider {

    /**
     * Vérifie les messages correspondant aux critères de bulletin.
     * Ne retourne QUE les métadonnées — pas les pièces jointes.
     *
     * @param config Configuration du compte mail
     * @param sinceTimestamp Timestamp minimum (tous les messages avant sont ignorés)
     * @param filterSubject Sujet à rechercher (défaut: "paie")
     * @param requireAttachment Si true, ne retourne que les messages avec pièce jointe
     * @return Liste des messages correspondant aux critères
     */
    suspend fun checkForMessages(
        config: MailConfig,
        sinceTimestamp: Long,
        filterSubject: String = "paie",
        requireAttachment: Boolean = true
    ): Result<List<MailMessage>>

    /**
     * Télécharge la pièce jointe d'un message spécifique.
     * Cible UNIQUEMENT l'ID de la pièce jointe PDF — ignore le corps du message.
     *
     * @param config Configuration du compte mail
     * @param messageId ID unique du message
     * @param savePath Chemin complet de sauvegarde
     * @return Le chemin du fichier téléchargé
     */
    suspend fun downloadAttachment(
        config: MailConfig,
        messageId: String,
        savePath: String
    ): Result<String>
}
