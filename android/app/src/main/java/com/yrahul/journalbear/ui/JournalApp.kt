package com.yrahul.journalbear.ui

import android.net.Uri
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.automirrored.outlined.MenuBook
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.MoreVert
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.yrahul.journalbear.JournalStore

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun JournalApp(store: JournalStore) {
    var showCreate by rememberSaveable { mutableStateOf(false) }
    var showUnlock by rememberSaveable { mutableStateOf(false) }
    var pendingUri by rememberSaveable { mutableStateOf<String?>(null) }
    var showDiscard by rememberSaveable { mutableStateOf(false) }
    var showMenu by remember { mutableStateOf(false) }
    var showDiscardRecovery by rememberSaveable { mutableStateOf(false) }
    val snackbar = remember { SnackbarHostState() }
    val open =
        rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
            if (uri != null) {
                pendingUri = uri.toString()
                showUnlock = true
            }
        }
    val create =
        rememberLauncherForActivityResult(
            ActivityResultContracts.CreateDocument("application/octet-stream"),
            store::create,
        )
    val saveAs =
        rememberLauncherForActivityResult(
            ActivityResultContracts.CreateDocument("application/octet-stream"),
            store::saveAs,
        )

    val draft = store.draft
    val selected = store.selectedEntry
    val name = store.documentName
    val back: () -> Unit = {
        if (!store.isBusy) {
            if (draft != null) {
                if (draft.hasChanges) showDiscard = true else store.discardDraft()
            } else {
                store.selectedEntry = null
            }
        }
    }
    BackHandler(enabled = draft != null || selected != null || store.isBusy, onBack = back)
    LaunchedEffect(store.notice) {
        store.notice?.let { message ->
            snackbar.showSnackbar(message)
            store.dismissNotice()
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        if (draft != null) "New entry"
                        else if (selected != null) selected.displayDate
                        else name?.removeSuffix(".zjournal") ?: "JournalBear",
                        maxLines = 1,
                    )
                },
                navigationIcon = {
                    if (draft != null || selected != null)
                        IconButton(onClick = back, enabled = !store.isBusy) {
                            Icon(
                                if (draft != null) Icons.Outlined.Close
                                else Icons.AutoMirrored.Outlined.ArrowBack,
                                "Back",
                            )
                        }
                },
                actions = {
                    if (draft != null)
                        TextButton(
                            enabled =
                                !store.isBusy &&
                                    (draft.content.isNotBlank() || draft.images.isNotEmpty()),
                            onClick = {
                                if (store.needsSaveLocation) saveAs.launch("Journal.zjournal")
                                else store.saveEntry()
                            },
                        ) {
                            Text("Save entry")
                        }
                    if (name != null)
                        Box {
                            IconButton(onClick = { showMenu = true }, enabled = !store.isBusy) {
                                Icon(Icons.Outlined.MoreVert, "Journal options")
                            }
                            DropdownMenu(
                                expanded = showMenu,
                                onDismissRequest = { showMenu = false },
                            ) {
                                DropdownMenuItem(
                                    text = { Text("Save as") },
                                    onClick = {
                                        showMenu = false
                                        saveAs.launch("Journal.zjournal")
                                    },
                                )
                                if (draft == null)
                                    DropdownMenuItem(
                                        text = { Text("Close journal") },
                                        onClick = {
                                            showMenu = false
                                            store.close()
                                        },
                                    )
                            }
                        }
                },
            )
        },
        snackbarHost = { SnackbarHost(snackbar) },
        floatingActionButton = {
            if (name != null && draft == null && !store.isBusy)
                ExtendedFloatingActionButton(
                    onClick = store::startEntry,
                    icon = { Icon(Icons.Outlined.Add, null) },
                    text = { Text("New entry") },
                )
        },
    ) { padding ->
        Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.TopCenter) {
            Box(Modifier.fillMaxSize().widthIn(max = 840.dp)) {
                when {
                    draft != null ->
                        EntryEditor(draft, store.isBusy, store::updateDraft, store::attachImages)
                    selected != null -> EntryDetail(selected)
                    name != null ->
                        EntryList(
                            store.entries,
                            store.query,
                            { store.query = it },
                            { store.selectedEntry = it },
                        )
                    else ->
                        Welcome(
                            isBusy = store.isBusy,
                            hasRecovery = store.hasRecovery,
                            onCreate = { showCreate = true },
                            onOpen = { open.launch(arrayOf("*/*")) },
                            onRecover = {
                                pendingUri = null
                                showUnlock = true
                            },
                            onDiscardRecovery = { showDiscardRecovery = true },
                        )
                }
            }
            if (store.isBusy) LinearProgressIndicator(Modifier.fillMaxWidth())
        }
    }
    if (showCreate)
        PasswordDialog(
            isNew = true,
            onDismiss = { showCreate = false },
            onSubmit = { password ->
                store.prepareNew(password)
                showCreate = false
                create.launch("Journal.zjournal")
            },
        )
    if (showUnlock)
        PasswordDialog(
            isNew = false,
            onDismiss = { showUnlock = false },
            onSubmit = { password ->
                showUnlock = false
                store.open(pendingUri?.let(Uri::parse), password)
            },
        )
    store.error?.let { message ->
        AlertDialog(
            onDismissRequest = store::dismissError,
            title = { Text("Couldn't complete that") },
            text = {
                Text(
                    message +
                        if (store.hasRecovery)
                            "\n\nAn encrypted recovery copy is kept on this device. Retry saving, or choose Save as."
                        else ""
                )
            },
            confirmButton = { TextButton(onClick = store::dismissError) { Text("OK") } },
        )
    }
    if (showDiscardRecovery)
        AlertDialog(
            onDismissRequest = { showDiscardRecovery = false },
            title = { Text("Discard recovery copy?") },
            text = {
                Text(
                    "This permanently removes the unsaved recovery copy from this device. Saved journal files are kept."
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        showDiscardRecovery = false
                        store.discardRecovery()
                    }
                ) {
                    Text("Discard recovery")
                }
            },
            dismissButton = {
                TextButton(onClick = { showDiscardRecovery = false }) { Text("Cancel") }
            },
        )
    if (showDiscard)
        AlertDialog(
            onDismissRequest = { showDiscard = false },
            title = { Text("Discard this entry?") },
            text = { Text("Your draft has not been saved.") },
            confirmButton = {
                TextButton(
                    onClick = {
                        showDiscard = false
                        store.discardDraft()
                    }
                ) {
                    Text("Discard")
                }
            },
            dismissButton = {
                TextButton(onClick = { showDiscard = false }) { Text("Keep writing") }
            },
        )
}

@Composable
private fun Welcome(
    isBusy: Boolean,
    hasRecovery: Boolean,
    onCreate: () -> Unit,
    onOpen: () -> Unit,
    onRecover: () -> Unit,
    onDiscardRecovery: () -> Unit,
) {
    Column(
        Modifier.fillMaxSize().padding(32.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Icon(
            Icons.AutoMirrored.Outlined.MenuBook,
            null,
            Modifier.size(72.dp),
            tint = MaterialTheme.colorScheme.primary,
        )
        Spacer(Modifier.height(24.dp))
        Text(
            "A little space for your day",
            style = MaterialTheme.typography.headlineMedium,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(12.dp))
        Text(
            "Your words and photos, in a journal\nonly your password can open.",
            style = MaterialTheme.typography.bodyLarge,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(32.dp))
        if (hasRecovery) {
            Text(
                "A journal save was interrupted. Recover it before starting another journal.",
                textAlign = TextAlign.Center,
            )
            Spacer(Modifier.height(16.dp))
            Button(onClick = onRecover, enabled = !isBusy) { Text("Recover journal") }
            TextButton(onClick = onDiscardRecovery, enabled = !isBusy) {
                Text("Discard recovery copy")
            }
        } else {
            Button(onClick = onOpen, enabled = !isBusy) { Text("Open journal") }
            OutlinedButton(onClick = onCreate, enabled = !isBusy) { Text("Create journal") }
        }
    }
}
