package com.yrahul.journalbear

import android.app.Application
import android.net.Uri
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.yrahul.journalbear.core.Attachment
import com.yrahul.journalbear.core.JournalEntry
import com.yrahul.journalbear.core.JournalException
import com.yrahul.journalbear.core.JournalFile
import com.yrahul.journalbear.core.readLimited
import java.io.IOException
import java.time.LocalDate
import java.time.ZoneId
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

data class EntryDraft(
    val content: String = "",
    private val initialDate: LocalDate = LocalDate.now(),
    val date: LocalDate = initialDate,
    val sentiment: String = "Neutral",
    val images: List<Attachment> = emptyList(),
) {
    val hasChanges: Boolean
        get() =
            content.isNotEmpty() ||
                images.isNotEmpty() ||
                sentiment != "Neutral" ||
                date != initialDate
}

class JournalStore(application: Application) : AndroidViewModel(application) {
    private val storage = JournalStorage(application)
    private var fileUri: Uri? = null
    private var password = CharArray(0)
    private var pendingPassword = CharArray(0)

    var documentName by mutableStateOf<String?>(null)
        private set

    var entries by mutableStateOf<List<JournalEntry>>(emptyList())
        private set

    var isBusy by mutableStateOf(false)
        private set

    var error by mutableStateOf<String?>(null)
        private set

    var hasRecovery by mutableStateOf(storage.hasRecovery)
        private set

    var draft by mutableStateOf<EntryDraft?>(null)
        private set

    var selectedEntry by mutableStateOf<JournalEntry?>(null)
    var query by mutableStateOf("")
    var notice by mutableStateOf<String?>(null)
        private set

    val needsSaveLocation: Boolean
        get() = fileUri == null

    fun prepareNew(candidate: String) {
        pendingPassword.fill('\u0000')
        pendingPassword = candidate.toCharArray()
    }

    fun create(uri: Uri?) {
        val candidate = pendingPassword
        pendingPassword = CharArray(0)
        if (uri == null) {
            candidate.fill('\u0000')
            return
        }
        if (candidate.isEmpty()) {
            error = "The app restarted while choosing a location. Please create the journal again."
            return
        }
        runOperation {
            try {
                val name =
                    withContext(Dispatchers.IO) {
                        storage.write(uri, JournalFile.encrypt(emptyList(), candidate))
                        storage.name(uri)
                    }
                replaceJournal(emptyList(), candidate, uri, name)
            } finally {
                candidate.fill('\u0000')
            }
        }
    }

    fun open(uri: Uri?, candidate: String) {
        val secret = candidate.toCharArray()
        runOperation {
            try {
                val (loaded, name) =
                    withContext(Dispatchers.IO) {
                        val bytes = if (uri == null) storage.readRecovery() else storage.read(uri)
                        JournalFile.open(bytes, secret) to
                            (uri?.let(storage::name) ?: "Recovered journal")
                    }
                replaceJournal(loaded, secret, uri, name)
            } finally {
                secret.fill('\u0000')
            }
        }
    }

    private fun replaceJournal(
        loaded: List<JournalEntry>,
        secret: CharArray,
        uri: Uri?,
        name: String,
    ) {
        password.fill('\u0000')
        password = secret.copyOf()
        fileUri = uri
        documentName = name
        entries = loaded
        selectedEntry = null
        query = ""
        draft = null
    }

    fun startEntry() {
        if (!isBusy) draft = EntryDraft()
    }

    fun updateDraft(value: EntryDraft) {
        if (!isBusy) draft = value
    }

    fun discardDraft() {
        if (!isBusy) draft = null
    }

    fun attachImages(uris: List<Uri>) {
        val current = draft ?: return
        if (uris.isEmpty()) return
        runOperation {
            val images =
                withContext(Dispatchers.IO) {
                    uris.map { uri ->
                        val bytes =
                            getApplication<Application>()
                                .contentResolver
                                .openInputStream(uri)
                                ?.use { it.readLimited(JournalFile.MAX_IMAGE_BYTES) }
                                ?: throw JournalException("An image could not be opened.")
                        prepareImageAttachment(bytes)
                    }
                }
            draft = current.copy(images = current.images + images)
        }
    }

    fun saveEntry(destination: Uri? = fileUri) {
        val current = draft ?: return
        val uri = destination ?: return
        if (current.content.isBlank() && current.images.isEmpty()) return
        val entry =
            JournalEntry(
                current.date.atStartOfDay(ZoneId.systemDefault()).toInstant().toString(),
                current.content,
                current.sentiment,
                current.images,
            )
        val updated = entries + entry
        runOperation {
            val name = persist(uri, updated)
            entries = updated
            fileUri = uri
            documentName = name
            draft = null
            selectedEntry = entry
            notice = "Entry saved"
        }
    }

    fun saveAs(uri: Uri?) {
        if (uri == null) return
        if (documentName == null) {
            error = "The app restarted while choosing a location. Please reopen your journal."
            return
        }
        val current = draft
        if (current != null && (current.content.isNotBlank() || current.images.isNotEmpty())) {
            saveEntry(uri)
            return
        }
        runOperation {
            val name = persist(uri, entries)
            fileUri = uri
            documentName = name
            notice = "Journal saved"
        }
    }

    private suspend fun persist(uri: Uri, snapshot: List<JournalEntry>): String {
        // Clearing a ViewModel can overlap an already-running provider write.
        // Its password snapshot must stay intact until that write finishes.
        val secret = password.copyOf()
        try {
            return withContext(Dispatchers.IO) {
                storage.write(uri, JournalFile.encrypt(snapshot, secret))
                storage.name(uri)
            }
        } finally {
            secret.fill('\u0000')
        }
    }

    fun close() {
        if (isBusy) return
        password.fill('\u0000')
        pendingPassword.fill('\u0000')
        fileUri = null
        documentName = null
        entries = emptyList()
        selectedEntry = null
        draft = null
        query = ""
    }

    fun discardRecovery() {
        if (!isBusy) {
            storage.discardRecovery()
            hasRecovery = storage.hasRecovery
        }
    }

    fun dismissError() {
        error = null
    }

    fun dismissNotice() {
        notice = null
    }

    private fun runOperation(operation: suspend () -> Unit) {
        if (isBusy) return
        isBusy = true
        error = null
        viewModelScope.launch {
            try {
                operation()
            } catch (failure: JournalException) {
                error = failure.message
            } catch (_: IOException) {
                error = "The file operation failed. Please try again."
            } catch (failure: SecurityException) {
                error = "Access to the file was denied. Choose a writable location using Save as."
            } finally {
                hasRecovery = storage.hasRecovery
                isBusy = false
            }
        }
    }

    override fun onCleared() {
        password.fill('\u0000')
        pendingPassword.fill('\u0000')
    }
}
