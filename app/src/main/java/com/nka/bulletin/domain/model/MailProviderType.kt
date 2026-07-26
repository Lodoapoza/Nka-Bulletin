package com.nka.bulletin.domain.model

/**
 * Type de fournisseur de messagerie supporté.
 */
enum class MailProviderType(val displayName: String) {
    GMAIL("Gmail"),
    OUTLOOK("Outlook / Exchange"),
    IMAP("IMAP (Autre)")
}
