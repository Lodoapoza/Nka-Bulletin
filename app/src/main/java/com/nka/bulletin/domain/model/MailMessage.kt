package com.nka.bulletin.domain.model

/**
 * Métadonnées d'un email récupéré depuis un provider.
 * Aucune donnée sensible — seulement les infos nécessaires au filtrage.
 */
data class MailMessage(
    val id: String,
    val subject: String,
    val sender: String,
    val receivedDate: Long,
    val hasAttachment: Boolean,
    val attachmentName: String?
) {
    /**
     * Vérifie si le sujet correspond à un bulletin de paie.
     */
    fun isBulletinCandidate(): Boolean {
        val lowerSubject = subject.lowercase()
        val lowerAttachment = attachmentName?.lowercase() ?: ""
        return (lowerSubject.contains("paie") || lowerSubject.contains("bulletin") ||
                lowerSubject.contains("salaire") || lowerSubject.contains("paye")) &&
                (hasAttachment || lowerAttachment.endsWith(".pdf"))
    }

    /**
     * Détecte si c'est une gratification/prime (cas décembre).
     */
    fun isGratificationCandidate(): Boolean {
        val lowerSubject = subject.lowercase()
        val lowerAttachment = attachmentName?.lowercase() ?: ""
        return lowerSubject.contains("gratification") ||
                lowerSubject.contains("prime") ||
                lowerSubject.contains("13ème") ||
                lowerAttachment.contains("gratification") ||
                lowerAttachment.contains("prime")
    }
}
