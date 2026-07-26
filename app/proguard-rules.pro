# PdfBox
-keep class org.apache.pdfbox.** { *; }
-dontwarn org.apache.pdfbox.**

# javax.mail / android-mail
-keep class javax.mail.** { *; }
-dontwarn javax.mail.**

# Room
-keep class * extends androidx.room.RoomDatabase
-keep @androidx.room.Entity class * { *; }
-dontwarn androidx.room.paging.**

# Gmail API
-keep class com.google.api.services.gmail.** { *; }
-dontwarn com.google.api.services.gmail.**

# Google API Client
-keep class com.google.api.client.** { *; }
-dontwarn com.google.api.client.**

# MSAL
-keep class com.microsoft.identity.client.** { *; }
-dontwarn com.microsoft.identity.client.**

# Kotlin Coroutines
-dontwarn kotlinx.coroutines.**
