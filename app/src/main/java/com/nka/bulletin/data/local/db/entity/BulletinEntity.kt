package com.nka.bulletin.data.local.db.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey
import com.nka.bulletin.domain.model.Bulletin

@Entity(
    tableName = "bulletins",
    indices = [
        Index(value = ["month", "year"]),
        Index(value = ["file_name"], unique = true)
    ]
)
data class BulletinEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    @ColumnInfo(name = "file_name") val fileName: String,
    @ColumnInfo(name = "file_path") val filePath: String,
    val month: Int,
    val year: Int,
    @ColumnInfo(name = "employer_name") val employerName: String?,
    @ColumnInfo(name = "gross_salary") val grossSalary: Double?,
    @ColumnInfo(name = "net_salary") val netSalary: Double?,
    @ColumnInfo(name = "download_date") val downloadDate: Long,
    @ColumnInfo(name = "mail_source") val mailSource: String,
    @ColumnInfo(name = "is_gratification") val isGratification: Boolean = false,
    @ColumnInfo(name = "is_merged") val isMerged: Boolean = false,
    @ColumnInfo(name = "page_count") val pageCount: Int = 1
) {
    /**
     * Convertit l'entité Room en modèle domaine.
     */
    fun toDomainModel(): Bulletin = Bulletin(
        id = id,
        fileName = fileName,
        filePath = filePath,
        month = month,
        year = year,
        employerName = employerName,
        grossSalary = grossSalary,
        netSalary = netSalary,
        downloadDate = downloadDate,
        mailSource = mailSource,
        isGratification = isGratification,
        isMerged = isMerged,
        pageCount = pageCount
    )

    companion object {
        /**
         * Convertit un modèle domaine en entité Room.
         */
        fun fromDomainModel(bulletin: Bulletin): BulletinEntity = BulletinEntity(
            id = bulletin.id,
            fileName = bulletin.fileName,
            filePath = bulletin.filePath,
            month = bulletin.month,
            year = bulletin.year,
            employerName = bulletin.employerName,
            grossSalary = bulletin.grossSalary,
            netSalary = bulletin.netSalary,
            downloadDate = bulletin.downloadDate,
            mailSource = bulletin.mailSource,
            isGratification = bulletin.isGratification,
            isMerged = bulletin.isMerged,
            pageCount = bulletin.pageCount
        )
    }
}
