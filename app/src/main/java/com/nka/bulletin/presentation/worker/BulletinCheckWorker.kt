package com.nka.bulletin.presentation.worker

import android.content.Context
import android.content.Intent
import androidx.hilt.work.HiltWorker
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.nka.bulletin.NkaApplication
import com.nka.bulletin.domain.repository.AuthRepository
import com.nka.bulletin.domain.repository.BulletinRepository
import com.nka.bulletin.domain.usecase.CheckNewBulletinsUseCase
import com.nka.bulletin.domain.usecase.DownloadBulletinUseCase
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject
import java.util.Calendar
import java.util.concurrent.TimeUnit

/**
 * Worker périodique de vérification des bulletins.
 *
 * Règles métier :
 * - S'exécute toutes les 1h
 * - Ne vérifie QUE entre le 16 et la fin du mois
 * - S'arrête si TOUS les bulletins du mois sont détectés
 * - Décembre : bulletin NORMAL + GRATIFICATION requis
 * - Envoie une notification locale si nouveau bulletin trouvé
 */
@HiltWorker
class BulletinCheckWorker @AssistedInject constructor(
    @Assisted context: Context,
    @Assisted params: WorkerParameters,
    private val checkNewBulletinsUseCase: CheckNewBulletinsUseCase,
    private val downloadBulletinUseCase: DownloadBulletinUseCase,
    private val authRepository: AuthRepository,
    private val bulletinRepository: BulletinRepository
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        // Vérifier la fenêtre temporelle
        val calendar = Calendar.getInstance()
        val currentDay = calendar.get(Calendar.DAY_OF_MONTH)
        val currentMonth = calendar.get(Calendar.MONTH) + 1
        val currentYear = calendar.get(Calendar.YEAR)

        // Hors fenêtre (avant le 16 du mois)
        if (currentDay < 16) {
            return Result.success()
        }

        // Vérifier si déjà complets pour ce mois
        val alreadyComplete = isMonthComplete(currentMonth, currentYear)
        if (alreadyComplete) {
            return Result.success()
        }

        // Récupérer les configurations mail
        val configs = authRepository.getMailConfigs()
        if (configs.isEmpty()) {
            return Result.success()
        }

        var foundAny = false
        var gratificationFound = false

        for (config in configs) {
            val result = checkNewBulletinsUseCase(config)
            when (val checkResult = result.getOrNull()) {
                is CheckNewBulletinsUseCase.CheckResult.Found -> {
                    foundAny = true

                    // Détecter si des gratifications sont dans le lot
                    gratificationFound = checkResult.gratificationCount > 0

                    // Télécharger les bulletins trouvés
                    for (message in checkResult.messages) {
                        val isGratification = message.isGratificationCandidate()
                        val fileName = message.attachmentName ?: "bulletin_${message.id}.pdf"

                        downloadBulletinUseCase(
                            mailConfig = config,
                            messageId = message.id,
                            fileName = fileName,
                            month = currentMonth,
                            year = currentYear,
                            isGratification = isGratification,
                            filesDir = applicationContext.filesDir.absolutePath
                        )
                    }

                    // Envoyer une notification
                    sendNotification(
                        monthName = getMonthName(currentMonth),
                        count = checkResult.messages.size
                    )
                }
                is CheckNewBulletinsUseCase.CheckResult.Stopped -> {
                    // Mois déjà complet, pas besoin de continuer
                    return Result.success()
                }
                else -> {
                    // NoResults ou Skipped → continuer
                }
            }
        }

        // Vérifier si on peut s'arrêter
        if (foundAny) {
            if (currentMonth == 12) {
                // Décembre : besoin des deux
                val hasNormal = bulletinRepository.getBulletinsByMonth(12, currentYear)
                    .let { flow ->
                        var list = emptyList<com.nka.bulletin.domain.model.Bulletin>()
                        flow.collect { list = it; return@collect }
                        list.any { !it.isGratification }
                    }
                val hasGratification = bulletinRepository.getBulletinsByMonth(12, currentYear)
                    .let { flow ->
                        var list = emptyList<com.nka.bulletin.domain.model.Bulletin>()
                        flow.collect { list = it; return@collect }
                        list.any { it.isGratification }
                    }
                if (hasNormal && hasGratification) {
                    cancelWork()
                }
            } else {
                // Autres mois : bulletin normal suffit
                cancelWork()
            }
        }

        return Result.success()
    }

    /**
     * Vérifie si tous les bulletins du mois sont déjà en base.
     */
    private suspend fun isMonthComplete(month: Int, year: Int): Boolean {
        val bulletins = bulletinRepository.getBulletinsByMonth(month, year)
        var list = emptyList<com.nka.bulletin.domain.model.Bulletin>()
        bulletins.collect { list = it; return@collect }

        if (list.isEmpty()) return false

        return if (month == 12) {
            // Décembre : besoin des deux
            list.any { !it.isGratification } && list.any { it.isGratification }
        } else {
            // Mois normal : un bulletin suffit
            list.any { !it.isGratification }
        }
    }

    private fun sendNotification(monthName: String, count: Int) {
        val intent = Intent(applicationContext, com.nka.bulletin.MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        }

        val pendingIntent = android.app.PendingIntent.getActivity(
            applicationContext,
            0,
            intent,
            android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_IMMUTABLE
        )

        @Suppress("DEPRECATION")
        val builder = android.app.Notification.Builder(
            applicationContext,
            NkaApplication.NOTIFICATION_CHANNEL_ID
        )
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle("Nouveau bulletin de paie")
            .setContentText("$count bulletin(s) disponible(s) pour $monthName")
            .setPriority(android.app.Notification.PRIORITY_DEFAULT)
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)

        val notification = builder.build()

        try {
            val mgr = applicationContext.getSystemService(Context.NOTIFICATION_SERVICE)
                    as android.app.NotificationManager
            mgr.notify(System.currentTimeMillis().toInt(), notification)
        } catch (e: Exception) {
            // Notification silencieusement ignorée
        }
    }

    private fun getMonthName(month: Int): String {
        return when (month) {
            1 -> "Janvier"
            2 -> "Février"
            3 -> "Mars"
            4 -> "Avril"
            5 -> "Mai"
            6 -> "Juin"
            7 -> "Juillet"
            8 -> "Août"
            9 -> "Septembre"
            10 -> "Octobre"
            11 -> "Novembre"
            12 -> "Décembre"
            else -> "?"
        }
    }

    private fun cancelWork() {
        WorkManager.getInstance(applicationContext)
            .cancelUniqueWork(BULLETIN_CHECK_WORK_NAME)
    }

    companion object {
        const val BULLETIN_CHECK_WORK_NAME = "bulletin_check_work"

        fun schedule(context: Context) {
            val constraints = androidx.work.Constraints.Builder()
                .setRequiredNetworkType(androidx.work.NetworkType.CONNECTED)
                .build()

            val workRequest = PeriodicWorkRequestBuilder<BulletinCheckWorker>(
                1, TimeUnit.HOURS
            )
                .setConstraints(constraints)
                .addTag(BULLETIN_CHECK_WORK_NAME)
                .build()

            WorkManager.getInstance(context)
                .enqueueUniquePeriodicWork(
                    BULLETIN_CHECK_WORK_NAME,
                    ExistingPeriodicWorkPolicy.KEEP,
                    workRequest
                )
        }

        fun cancel(context: Context) {
            WorkManager.getInstance(context)
                .cancelUniqueWork(BULLETIN_CHECK_WORK_NAME)
        }
    }
}
