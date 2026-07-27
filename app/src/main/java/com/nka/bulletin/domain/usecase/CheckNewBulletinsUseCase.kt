package com.nka.bulletin.domain.usecase

import com.nka.bulletin.domain.model.Bulletin
import com.nka.bulletin.domain.model.MailConfig
import com.nka.bulletin.domain.repository.BulletinRepository
import com.nka.bulletin.domain.repository.MailRepository
import java.util.Calendar
import javax.inject.Inject

/**
 * Orchestre la vérification des nouveaux bulletins.
 * WorkManager appelle ce use case périodiquement.
 *
 * Règles métier :
 * - Ne vérifie QUE entre le 16 et la fin du mois
 * - S'arrête si TOUS les bulletins du mois sont détectés
 * - Décembre : bulletin normal + gratification = 2 bulletins obligatoires
 */
class CheckNewBulletinsUseCase @Inject constructor(
    private val bulletinRepository: BulletinRepository,
    private val mailRepository: MailRepository
) {

    /**
     * Vérifie les nouveaux bulletins pour la configuration donnée.
     * @return Liste des nouveaux bulletins détectés (pas encore en base)
     */
    suspend operator fun invoke(config: MailConfig): Result<CheckResult> = runCatching {
        val calendar = Calendar.getInstance()
        val currentMonth = calendar.get(Calendar.MONTH) + 1 // 1-12
        val currentDay = calendar.get(Calendar.DAY_OF_MONTH)
        val currentYear = calendar.get(Calendar.YEAR)

        // Vérifier la fenêtre temporelle (16-31 du mois)
        if (currentDay < 16) {
            return CheckResult.Skipped("Hors fenêtre temporelle (avant le 16)")
        }

        // Déjà des bulletins ce mois-ci ?
        val existingBulletins = mutableListOf<Bulletin>()
        bulletinRepository.getBulletinsByMonth(currentMonth, currentYear).collect { bulletins ->
            existingBulletins.addAll(bulletins)
            return@collect
        }

        val hasNormal = existingBulletins.any { !it.isGratification }
        val hasGratification = existingBulletins.any { it.isGratification }

        // Vérifier les règles d'arrêt
        if (hasNormal) {
            if (currentMonth == 12) {
                // Décembre : besoin des DEUX (normal + gratification)
                if (hasGratification) {
                    return CheckResult.Stopped("Décembre : normal + gratification déjà détectés")
                }
            } else {
                return CheckResult.Stopped("Bulletin de $currentMonth/$currentYear déjà détecté")
            }
        }

        // Interroger le provider mail
        val messages = mailRepository.checkForNewBulletins(
            config = config,
            sinceTimestamp = getStartOfMonthTimestamp(currentYear, currentMonth)
        ).getOrThrow()

        val newBulletins = messages.filter { message ->
            message.isBulletinCandidate() &&
                    !existingBulletins.any { b ->
                        b.fileName.contains(message.attachmentName ?: "") ||
                                b.mailSource == message.sender
                    }
        }

        if (newBulletins.isEmpty()) {
            return CheckResult.NoResults
        }

        val detectedCount = newBulletins.size
        val gratificationCount = newBulletins.count { it.isGratificationCandidate() }

        CheckResult.Found(
                messages = newBulletins,
                normalCount = detectedCount - gratificationCount,
                gratificationCount = gratificationCount
            )
    }

    private fun getStartOfMonthTimestamp(year: Int, month: Int): Long {
        val cal = Calendar.getInstance()
        cal.set(year, month - 1, 1, 0, 0, 0)
        cal.set(Calendar.MILLISECOND, 0)
        return cal.timeInMillis
    }

    /**
     * Résultat de la vérification.
     */
    sealed class CheckResult {
        data class Found(
            val messages: List<com.nka.bulletin.domain.model.MailMessage>,
            val normalCount: Int,
            val gratificationCount: Int
        ) : CheckResult()

        data class Skipped(val reason: String) : CheckResult()
        data class Stopped(val reason: String) : CheckResult()
        data object NoResults : CheckResult()
    }
}
