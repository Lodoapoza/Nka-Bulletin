package com.nka.bulletin.domain.usecase

import com.nka.bulletin.domain.model.Bulletin
import com.nka.bulletin.domain.model.MailConfig
import com.nka.bulletin.domain.repository.BulletinRepository
import com.nka.bulletin.domain.repository.MailRepository
import com.nka.bulletin.domain.repository.AuthRepository
import java.io.File
import javax.inject.Inject

/**
 * Télécharge un bulletin depuis le fournisseur mail,
 * le sauvegarde en local, et crée l'entrée en base.
 */
class DownloadBulletinUseCase @Inject constructor(
    private val mailRepository: MailRepository,
    private val bulletinRepository: BulletinRepository,
    private val authRepository: AuthRepository,
    private val extractBulletinInfoUseCase: ExtractBulletinInfoUseCase
) {

    /**
     * Télécharge et enregistre un bulletin.
     * @param mailConfig Configuration du compte mail source
     * @param messageId ID du message contenant la pièce jointe
     * @param fileName Nom du fichier à sauvegarder
     * @param month Mois du bulletin
     * @param year Année du bulletin
     * @param isGratification Si c'est une gratification
     * @param filesDir Répertoire de stockage (context.filesDir)
     * @return Le bulletin créé et sauvegardé
     */
    suspend operator fun invoke(
        mailConfig: MailConfig,
        messageId: String,
        fileName: String,
        month: Int,
        year: Int,
        isGratification: Boolean,
        filesDir: String
    ): Result<Bulletin> = runCatching {
        // Déterminer le chemin de sauvegarde
        val bulletinsDir = File(filesDir, "bulletins")
        if (!bulletinsDir.exists()) bulletinsDir.mkdirs()

        val localFileName = "${year}_${month.toString().padStart(2, '0')}_${fileName}"
        val savePath = File(bulletinsDir, localFileName).absolutePath

        // Télécharger via le provider mail
        val downloadedPath = mailRepository.downloadBulletin(
            config = mailConfig,
            messageId = messageId,
            savePath = savePath
        ).getOrThrow()

        // Extraire les infos du PDF
        val extractedInfo = extractBulletinInfoUseCase(downloadedPath).getOrNull()

        // Créer le bulletin
        val bulletin = Bulletin(
            fileName = localFileName,
            filePath = downloadedPath,
            month = month,
            year = year,
            employerName = extractedInfo?.employerName,
            grossSalary = extractedInfo?.grossSalary,
            netSalary = extractedInfo?.netSalary,
            downloadDate = System.currentTimeMillis(),
            mailSource = mailConfig.email,
            isGratification = isGratification,
            pageCount = extractedInfo?.pageCount ?: 1
        )

        // Sauvegarder en base
        val id = bulletinRepository.insertBulletin(bulletin)
        bulletin.copy(id = id)
    }
}
