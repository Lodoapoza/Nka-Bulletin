package com.nka.bulletin.presentation.navigation

import androidx.compose.runtime.Composable
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.navArgument
import com.nka.bulletin.presentation.auth.AuthScreen
import com.nka.bulletin.presentation.dashboard.DashboardScreen
import com.nka.bulletin.presentation.explorer.ExplorerScreen
import com.nka.bulletin.presentation.merge.MergeScreen
import com.nka.bulletin.presentation.unlock.UnlockScreen

/**
 * Routes de navigation de l'application.
 */
object Routes {
    const val AUTH = "auth"
    const val UNLOCK = "unlock"
    const val DASHBOARD = "dashboard"
    const val EXPLORER = "explorer"
    const val MERGE = "merge/{ids}"

    fun mergeRoute(ids: List<Long>): String {
        return "merge/${ids.joinToString(",")}"
    }
}

@Composable
fun NavGraph(
    navController: NavHostController,
    startDestination: String = Routes.AUTH
) {
    NavHost(
        navController = navController,
        startDestination = startDestination
    ) {
        composable(Routes.AUTH) {
            AuthScreen(
                onAuthenticated = {
                    // Première configuration terminée → Dashboard directement
                    navController.navigate(Routes.DASHBOARD) {
                        popUpTo(Routes.AUTH) { inclusive = true }
                    }
                }
            )
        }

        composable(Routes.UNLOCK) {
            UnlockScreen(
                onUnlocked = {
                    navController.navigate(Routes.DASHBOARD) {
                        popUpTo(Routes.UNLOCK) { inclusive = true }
                    }
                }
            )
        }

        composable(Routes.DASHBOARD) {
            DashboardScreen(
                onNavigateToExplorer = { navController.navigate(Routes.EXPLORER) },
                onNavigateToMerge = { ids ->
                    navController.navigate(Routes.mergeRoute(ids))
                }
            )
        }

        composable(Routes.EXPLORER) {
            ExplorerScreen(
                onNavigateToMerge = { ids ->
                    navController.navigate(Routes.mergeRoute(ids))
                },
                onBack = { navController.popBackStack() }
            )
        }

        composable(
            route = Routes.MERGE,
            arguments = listOf(
                navArgument("ids") { type = NavType.StringType }
            )
        ) { backStackEntry ->
            val idsString = backStackEntry.arguments?.getString("ids") ?: ""
            val ids = idsString.split(",").mapNotNull { it.toLongOrNull() }
            MergeScreen(
                selectedIds = ids,
                onBack = { navController.popBackStack() }
            )
        }
    }
}
