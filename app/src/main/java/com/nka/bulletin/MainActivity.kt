package com.nka.bulletin

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.Modifier
import androidx.navigation.compose.rememberNavController
import com.nka.bulletin.presentation.navigation.NavGraph
import com.nka.bulletin.presentation.theme.NkaBulletinTheme
import com.nka.bulletin.presentation.navigation.Routes
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject

@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    @Inject
    lateinit var secureStorage: com.nka.bulletin.data.local.secure.SecureStorageManager

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        // Déterminer l'écran de départ :
        // - PIN déjà défini → écran de déverrouillage (UNLOCK)
        // - Jamais configuré → écran de configuration initiale (AUTH)
        val startDest = if (secureStorage.isPinSet()) {
            Routes.UNLOCK
        } else {
            Routes.AUTH
        }

        setContent {
            NkaBulletinTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    val navController = rememberNavController()
                    NavGraph(
                        navController = navController,
                        startDestination = startDest
                    )
                }
            }
        }
    }
}
