package com.nka.bulletin.presentation.theme

import android.app.Activity
import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

private val LightColorScheme = lightColorScheme(
    primary = NkaPrimary,
    onPrimary = NkaOnPrimary,
    primaryContainer = NkaPrimaryLight,
    secondary = NkaSecondary,
    onSecondary = NkaOnSecondary,
    secondaryContainer = NkaSecondaryLight,
    background = NkaBackground,
    surface = NkaSurface,
    onBackground = NkaOnBackground,
    onSurface = NkaOnSurface,
    error = NkaError,
    onError = NkaOnError,
    surfaceVariant = NkaSurfaceVariant,
    outline = NkaOutline
)

private val DarkColorScheme = darkColorScheme(
    primary = NkaPrimaryLight,
    onPrimary = NkaOnPrimary,
    primaryContainer = NkaPrimary,
    secondary = NkaSecondaryLight,
    onSecondary = NkaOnSecondary,
    secondaryContainer = NkaSecondary,
    background = NkaDarkBackground,
    surface = NkaDarkSurface,
    onBackground = NkaDarkOnBackground,
    onSurface = NkaDarkOnSurface,
    error = NkaError,
    onError = NkaOnError,
    surfaceVariant = NkaDarkSurfaceVariant,
    outline = NkaOutline
)

@Composable
fun NkaBulletinTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    dynamicColor: Boolean = true,
    content: @Composable () -> Unit
) {
    val colorScheme = when {
        dynamicColor && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S -> {
            val context = LocalContext.current
            if (darkTheme) dynamicDarkColorScheme(context)
            else dynamicLightColorScheme(context)
        }
        darkTheme -> DarkColorScheme
        else -> LightColorScheme
    }

    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as Activity).window
            window.statusBarColor = colorScheme.primary.toArgb()
            WindowCompat.getInsetsController(window, view).isAppearanceLightStatusBars = !darkTheme
        }
    }

    MaterialTheme(
        colorScheme = colorScheme,
        typography = NkaTypography,
        content = content
    )
}
