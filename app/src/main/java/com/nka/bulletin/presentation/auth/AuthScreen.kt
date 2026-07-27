package com.nka.bulletin.presentation.auth

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.MailOutline
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.nka.bulletin.domain.model.MailProviderType
import com.nka.bulletin.presentation.unlock.PinSetupScreen

@Composable
fun AuthScreen(
    onAuthenticated: () -> Unit,
    viewModel: AuthViewModel = hiltViewModel()
) {
    val state by viewModel.uiState.collectAsState()

    LaunchedEffect(state.isConfigured) {
        if (state.isConfigured) {
            onAuthenticated()
        }
    }

    when (state.step) {
        AuthStep.LOADING -> LoadingView()
        AuthStep.CHOOSE_PROVIDER -> ChooseProviderView(viewModel)
        AuthStep.GOOGLE_AUTH -> GoogleAuthView(viewModel)
        AuthStep.MICROSOFT_AUTH -> MicrosoftAuthView(viewModel)
        AuthStep.IMAP_CONFIG -> ImapConfigView(viewModel, state)
        AuthStep.PIN_SETUP -> PinSetupScreen(
            onPinSet = { viewModel.onPinSet() }
        )
        AuthStep.COMPLETE -> {
            LaunchedEffect(Unit) { onAuthenticated() }
        }
    }
}

@Composable
private fun LoadingView() {
    Column(
        modifier = Modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        CircularProgressIndicator()
        Spacer(modifier = Modifier.height(16.dp))
        Text("Configuration initiale...")
    }
}

@Composable
private fun ChooseProviderView(viewModel: AuthViewModel) {
    val state by viewModel.uiState.collectAsState()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text(
            text = "Bienvenue sur Nka Bulletin",
            style = MaterialTheme.typography.headlineMedium,
            fontWeight = FontWeight.Bold
        )

        Spacer(modifier = Modifier.height(8.dp))

        Text(
            text = "Votre gestionnaire de bulletins de paie sécurisé",
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center
        )

        Spacer(modifier = Modifier.height(32.dp))

        Text(
            text = "Choisissez votre fournisseur de messagerie",
            style = MaterialTheme.typography.titleMedium
        )

        Spacer(modifier = Modifier.height(16.dp))

        // Gmail
        Card(
            onClick = { viewModel.selectProvider(MailProviderType.GMAIL) },
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.surfaceVariant
            )
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text("Gmail", style = MaterialTheme.typography.titleMedium)
                Text(
                    "Connexion via Google OAuth 2.0",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }

        Spacer(modifier = Modifier.height(12.dp))

        // Outlook
        Card(
            onClick = { viewModel.selectProvider(MailProviderType.OUTLOOK) },
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.surfaceVariant
            )
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text("Outlook / Exchange", style = MaterialTheme.typography.titleMedium)
                Text(
                    "Connexion via Microsoft Graph API",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }

        Spacer(modifier = Modifier.height(12.dp))

        // IMAP
        Card(
            onClick = { viewModel.selectProvider(MailProviderType.IMAP) },
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.surfaceVariant
            )
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text("Autre (IMAP)", style = MaterialTheme.typography.titleMedium)
                Text(
                    "Configuration manuelle (mot de passe d'application)",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }

        Spacer(modifier = Modifier.height(24.dp))

        OutlinedButton(onClick = { viewModel.skipProvider() }) {
            Text("Configurer plus tard")
        }

        if (state.error != null) {
            Spacer(modifier = Modifier.height(16.dp))
            Text(
                text = state.error!!,
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodySmall
            )
        }
    }
}

@Composable
private fun GoogleAuthView(viewModel: AuthViewModel) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Icon(
            imageVector = Icons.Default.Email,
            contentDescription = null,
            modifier = Modifier.size(64.dp),
            tint = MaterialTheme.colorScheme.primary
        )

        Spacer(modifier = Modifier.height(24.dp))

        Text(
            text = "Connexion Gmail",
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.Bold
        )

        Spacer(modifier = Modifier.height(16.dp))

        Text(
            text = "Vous allez être redirigé vers Google pour autoriser Nka Bulletin à accéder à vos emails.",
            style = MaterialTheme.typography.bodyMedium,
            textAlign = TextAlign.Center
        )

        Spacer(modifier = Modifier.height(32.dp))

        // Placeholder pour l'authentification OAuth
        // L'implémentation réelle utilise GoogleAccountCredential avec AccountPicker
        OutlinedButton(
            onClick = {
                // Simuler une connexion réussie pour le développement
                viewModel.onGoogleAuthSuccess(
                    email = "utilisateur@gmail.com",
                    token = "placeholder_token"
                )
            }
        ) {
            Text("Se connecter avec Google")
        }

        Spacer(modifier = Modifier.height(16.dp))

        OutlinedButton(onClick = { viewModel.selectProvider(MailProviderType.GMAIL) }) {
            Text("Retour")
        }
    }
}

@Composable
private fun MicrosoftAuthView(viewModel: AuthViewModel) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Icon(
            imageVector = Icons.Default.MailOutline,
            contentDescription = null,
            modifier = Modifier.size(64.dp),
            tint = MaterialTheme.colorScheme.primary
        )

        Spacer(modifier = Modifier.height(24.dp))

        Text(
            text = "Connexion Outlook / Exchange",
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.Bold
        )

        Spacer(modifier = Modifier.height(16.dp))

        Text(
            text = "Vous allez être redirigé vers Microsoft pour autoriser Nka Bulletin à accéder à vos emails.",
            style = MaterialTheme.typography.bodyMedium,
            textAlign = TextAlign.Center
        )

        Spacer(modifier = Modifier.height(32.dp))

        OutlinedButton(onClick = {
            // Simuler une connexion réussie pour le développement
            viewModel.onMicrosoftAuthSuccess(
                upn = "utilisateur@outlook.com",
                token = "placeholder_token"
            )
        }) {
            Text("Se connecter avec Microsoft")
        }

        Spacer(modifier = Modifier.height(16.dp))

        OutlinedButton(onClick = { viewModel.selectProvider(MailProviderType.GMAIL) }) {
            Text("Retour")
        }
    }
}

@Composable
private fun ImapConfigView(
    viewModel: AuthViewModel,
    state: AuthUiState
) {
    var showPassword by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp)
            .verticalScroll(rememberScrollState()),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            text = "Configuration IMAP",
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.Bold
        )

        Spacer(modifier = Modifier.height(8.dp))

        Text(
            text = "Utilisez un mot de passe d'application (pas votre mot de passe principal)",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center
        )

        Spacer(modifier = Modifier.height(24.dp))

        OutlinedTextField(
            value = state.email,
            onValueChange = { viewModel.updateImapEmail(it) },
            label = { Text("Adresse email") },
            placeholder = { Text("vous@example.com") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email)
        )

        Spacer(modifier = Modifier.height(12.dp))

        OutlinedTextField(
            value = state.password,
            onValueChange = { viewModel.updateImapPassword(it) },
            label = { Text("Mot de passe d'application") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
            visualTransformation = if (showPassword) VisualTransformation.None
            else PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
            trailingIcon = {
                IconButton(onClick = { showPassword = !showPassword }) {
                    Icon(
                        imageVector = if (showPassword) Icons.Default.Visibility
                        else Icons.Default.VisibilityOff,
                        contentDescription = if (showPassword) "Masquer" else "Afficher"
                    )
                }
            }
        )

        Spacer(modifier = Modifier.height(12.dp))

        OutlinedTextField(
            value = state.imapHost,
            onValueChange = { viewModel.updateImapHost(it) },
            label = { Text("Serveur IMAP") },
            placeholder = { Text("imap.example.com") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri)
        )

        Spacer(modifier = Modifier.height(12.dp))

        OutlinedTextField(
            value = state.imapPort,
            onValueChange = { viewModel.updateImapPort(it) },
            label = { Text("Port IMAP") },
            placeholder = { Text("993") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number)
        )

        if (state.error != null) {
            Spacer(modifier = Modifier.height(12.dp))
            Text(
                text = state.error!!,
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodySmall
            )
        }

        Spacer(modifier = Modifier.height(24.dp))

        Button(
            onClick = { viewModel.configureImap() },
            modifier = Modifier.fillMaxWidth()
        ) {
            Text("Configurer")
        }

        Spacer(modifier = Modifier.height(12.dp))

        OutlinedButton(
            onClick = { viewModel.skipProvider() },
            modifier = Modifier.fillMaxWidth()
        ) {
            Text("Configurer plus tard")
        }
    }
}
