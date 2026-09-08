package com.yrahul.journalbear

import android.app.Application
import android.net.Uri
import androidx.test.core.app.ApplicationProvider
import com.yrahul.journalbear.core.JournalEntry
import com.yrahul.journalbear.core.JournalFile
import java.io.File
import java.io.IOException
import java.util.UUID
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class JournalStorageTest {
    private val application = ApplicationProvider.getApplicationContext<Application>()

    @Test
    fun restoredPickerCallbacksCannotWriteWithoutAnUnlockedSession() = runBlocking {
        val destination = File(application.cacheDir, "${UUID.randomUUID()}.zjournal")
        val original = byteArrayOf(10, 20, 30)
        destination.writeBytes(original)
        try {
            withContext(Dispatchers.Main) {
                val freshStore = JournalStore(application)
                freshStore.create(Uri.fromFile(destination))
                assertNotNull(freshStore.error)
                assertFalse(freshStore.isBusy)
                freshStore.dismissError()
                freshStore.saveCopy(Uri.fromFile(destination))
                assertNotNull(freshStore.error)
                assertFalse(freshStore.isBusy)
            }
            assertArrayEquals(original, destination.readBytes())
        } finally {
            destination.delete()
        }
    }

    @Test
    fun saveCopyWithEmptyDraftWritesAValidJournalAndPreservesDraft() = runBlocking {
        val original = File(application.cacheDir, "${UUID.randomUUID()}.zjournal")
        val copy = File(application.cacheDir, "${UUID.randomUUID()}.zjournal")
        val store = withContext(Dispatchers.Main) { JournalStore(application) }
        try {
            withContext(Dispatchers.Main) {
                store.prepareNew("test-password")
                store.create(Uri.fromFile(original))
            }
            awaitIdle(store)
            withContext(Dispatchers.Main) {
                store.startEntry()
                store.saveCopy(Uri.fromFile(copy))
            }
            awaitIdle(store)
            assertNotNull(store.draft)
            assertTrue(JournalFile.open(copy.readBytes(), "test-password".toCharArray()).isEmpty())
        } finally {
            withContext(Dispatchers.Main) { store.close() }
            original.delete()
            copy.delete()
        }
    }

    @Test
    fun failedProviderWriteKeepsEncryptedRecoveryUntilSuccessfulRetry() {
        val storage = JournalStorage(application)
        val bytes =
            JournalFile.encrypt(
                listOf(JournalEntry("2026-09-08", "Recover me")),
                "test-password".toCharArray(),
            )
        val destination = File(application.cacheDir, "${UUID.randomUUID()}/journal.zjournal")
        try {
            assertThrows(IOException::class.java) {
                storage.write(Uri.fromFile(destination), bytes)
            }
            assertTrue(storage.hasRecovery)
            assertArrayEquals(bytes, storage.readRecovery())
            assertEquals(
                "Recover me",
                JournalFile.open(storage.readRecovery(), "test-password".toCharArray())
                    .single()
                    .content,
            )
            checkNotNull(destination.parentFile).mkdirs()
            storage.write(Uri.fromFile(destination), bytes)
            assertFalse(storage.hasRecovery)
            assertArrayEquals(bytes, destination.readBytes())
        } finally {
            destination.delete()
            destination.parentFile?.delete()
        }
    }

    @Test
    fun failedEntrySaveRetainsDraftAndDoesNotPublishUnsavedEntry() = runBlocking {
        val destination = File(application.cacheDir, "${UUID.randomUUID()}/journal.zjournal")
        checkNotNull(destination.parentFile).mkdirs()
        val store = withContext(Dispatchers.Main) { JournalStore(application) }
        try {
            withContext(Dispatchers.Main) {
                store.prepareNew("test-password")
                store.create(Uri.fromFile(destination))
            }
            awaitIdle(store)
            assertNotNull(store.documentName)
            destination.delete()
            destination.parentFile?.delete()
            withContext(Dispatchers.Main) {
                store.startEntry()
                store.updateDraft(EntryDraft(content = "Keep this draft"))
                store.saveEntry()
            }
            awaitIdle(store)
            assertNotNull(store.error)
            assertEquals("Keep this draft", store.draft?.content)
            assertTrue(store.entries.isEmpty())
            assertTrue(store.hasRecovery)
            checkNotNull(destination.parentFile).mkdirs()
            withContext(Dispatchers.Main) { store.saveEntry() }
            awaitIdle(store)
            assertEquals("Keep this draft", store.entries.single().content)
            val date =
                java.time.Instant.parse(store.entries.single().entryDate)
                    .atZone(java.time.ZoneId.systemDefault())
                    .toLocalDate()
            assertEquals(java.time.LocalDate.now(), date)
            assertFalse(store.hasRecovery)
        } finally {
            withContext(Dispatchers.Main) { store.close() }
            destination.delete()
            destination.parentFile?.delete()
        }
    }

    private suspend fun awaitIdle(store: JournalStore) {
        withTimeout(15_000) { while (withContext(Dispatchers.Main) { store.isBusy }) delay(25) }
    }
}
