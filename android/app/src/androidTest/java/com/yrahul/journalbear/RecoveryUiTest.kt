package com.yrahul.journalbear

import android.app.Application
import android.net.Uri
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.core.app.ApplicationProvider
import com.yrahul.journalbear.core.JournalFile
import com.yrahul.journalbear.ui.JournalApp
import com.yrahul.journalbear.ui.JournalTheme
import java.io.File
import java.io.IOException
import java.util.UUID
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

class RecoveryUiTest {
    @get:Rule val compose = createComposeRule()

    @Test
    fun recoveryDiscardRequiresConfirmationAndRestoresWelcomeActions() {
        val application = ApplicationProvider.getApplicationContext<Application>()
        val storage = JournalStorage(application)
        val invalid =
            Uri.fromFile(File(application.cacheDir, "${UUID.randomUUID()}/journal.zjournal"))
        assertThrows(IOException::class.java) {
            storage.write(invalid, JournalFile.encrypt(emptyList(), "test-password".toCharArray()))
        }
        try {
            val store = JournalStore(application)
            compose.setContent { JournalTheme { JournalApp(store) } }
            compose.onNodeWithText("Recover journal").assertIsDisplayed()
            compose.onNodeWithText("Discard recovery copy").performClick()
            compose.onNodeWithText("Cancel").performClick()
            assertTrue(storage.hasRecovery)
            compose.onNodeWithText("Recover journal").assertIsDisplayed()
            compose.onNodeWithText("Discard recovery copy").performClick()
            compose.onNodeWithText("Discard recovery", substring = false).performClick()
            compose.onNodeWithText("Open journal").assertIsDisplayed()
            compose.onNodeWithText("Create journal").assertIsDisplayed()
            assertFalse(storage.hasRecovery)
        } finally {
            storage.discardRecovery()
        }
    }
}
