package com.nka.bulletin.domain.model

/**
 * Configuration de connexion à une boîte mail.
 * Le token est stocké chiffré via Android Keystore, pas en clair ici.
 */
data class MailConfig(
    val provider: MailProviderType,
    val email: String,
    val token: String? = null,
    val imapHost: String? = null,
    val imapPort: Int? = null, // généralement 993 pour IMAP SSL
    val imapSsl: Boolean = true
) {
    /**
     * Vérifie si la configuration est valide pour le provider choisi.
     */
    fun isValid(): Boolean {
        if (email.isBlank()) return false
        return when (provider) {
            MailProviderType.GMAIL -> !token.isNullOrBlank()
            MailProviderType.OUTLOOK -> !token.isNullOrBlank()
            MailProviderType.IMAP -> !imapHost.isNullOrBlank() && imapPort != null
        }
    }
}
