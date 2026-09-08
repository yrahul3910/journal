package com.yrahul.journalbear

import android.content.ContentValues
import android.graphics.Bitmap
import android.provider.MediaStore
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.v2.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.performTextReplacement
import androidx.test.filters.SdkSuppress
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.By
import androidx.test.uiautomator.UiDevice
import androidx.test.uiautomator.Until
import com.yrahul.journalbear.core.JournalFile
import java.util.UUID
import java.util.regex.Pattern
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

@SdkSuppress(minSdkVersion = 29)
class JournalAppTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()
    private val device = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation())
    private val password = "test-password"

    @Test
    fun passwordValidationAndCancel() {
        compose.onNodeWithText("Create journal").performClick()
        compose.onNodeWithText("Choose location").assertIsNotEnabled()
        compose.onNodeWithText("Password").performTextInput(password)
        compose.onNodeWithText("Confirm password").performTextInput("different")
        compose.onNodeWithText("Choose location").assertIsNotEnabled()
        compose.onNodeWithText("Cancel").performClick()
        compose.onNodeWithText("Open journal").assertIsDisplayed()
    }

    @Test
    fun createWriteSearchReopenAndRejectWrongPassword() {
        val filename = "JournalBear-test-${UUID.randomUUID()}.zjournal"
        createJournal(filename)
        compose.onNodeWithText("New entry", useUnmergedTree = true).performClick()
        compose.onNodeWithText("Save entry").assertIsNotEnabled()
        compose
            .onNodeWithText("What's on your mind?")
            .performTextInput("# A quiet morning\n\nA walk by the river.")
        compose.onNodeWithText("Happy").performClick()
        compose.onNodeWithText("Happy").assertIsSelected()
        compose.onNodeWithContentDescription("Entry date").performScrollTo().performClick()
        compose.onNodeWithText("Select date").assertIsDisplayed()
        val chosenDate = java.time.LocalDate.now().withDayOfMonth(1)
        compose
            .onNodeWithText(
                chosenDate.format(
                    java.time.format.DateTimeFormatter.ofPattern(
                        "EEEE, MMMM d, yyyy",
                        java.util.Locale.US,
                    )
                ),
                substring = true,
            )
            .performClick()
        compose.onNodeWithText("OK").performClick()
        compose
            .onNodeWithText(
                chosenDate.format(
                    java.time.format.DateTimeFormatter.ofLocalizedDate(
                        java.time.format.FormatStyle.MEDIUM
                    )
                )
            )
            .assertIsDisplayed()
        compose.activityRule.scenario.recreate()
        compose.onNodeWithText("Happy").assertIsSelected()
        captureScreen("editor")
        compose.onNodeWithText("Save entry").performClick()
        awaitText("Entry saved")
        captureScreen("entry")
        compose.onNodeWithContentDescription("Back").performClick()
        compose.onNodeWithText("Search entries").performTextInput("river happy")
        compose.onNodeWithText("# A quiet morning\n\nA walk by the river.").assertIsDisplayed()
        compose.onNodeWithText("Search entries").performTextReplacement("mountains")
        compose.onNodeWithText("No matching entries").assertIsDisplayed()
        compose.onNodeWithContentDescription("Journal options").performClick()
        compose.onNodeWithText("Close journal").performClick()

        openJournal(filename, "incorrect")
        awaitText("Couldn't complete that")
        compose.onNodeWithText("OK").performClick()
        openJournal(filename, password)
        awaitText("# A quiet morning\n\nA walk by the river.")

        try {
            val entries = JournalFile.open(readDownload(filename), password.toCharArray())
            assertEquals("Happy", entries.single().sentiment)
            assertEquals("# A quiet morning\n\nA walk by the river.", entries.single().content)

            compose.onNodeWithText("New entry", useUnmergedTree = true).performClick()
            compose.onNodeWithText("What's on your mind?").performTextInput("Unsaved draft")
            compose.onNodeWithContentDescription("Back").performClick()
            compose.onNodeWithText("Keep writing").performClick()
            compose.onNodeWithText("Unsaved draft").assertIsDisplayed()
            compose.onNodeWithContentDescription("Back").performClick()
            compose.onNodeWithText("Discard", substring = false).performClick()
        } finally {
            device.executeShellCommand("rm /sdcard/Download/$filename")
        }
    }

    @Test
    @SdkSuppress(minSdkVersion = 30)
    fun webpPhotoPickerAttachmentSurvivesSaveAndReopenAsJpeg() {
        val resolver = compose.activity.contentResolver
        val imageUri =
            checkNotNull(
                resolver.insert(
                    MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
                    ContentValues().apply {
                        put(MediaStore.Images.Media.DISPLAY_NAME, "JournalBear-test-photo.webp")
                        put(MediaStore.Images.Media.MIME_TYPE, "image/webp")
                    },
                )
            )
        val bitmap =
            Bitmap.createBitmap(32, 32, Bitmap.Config.ARGB_8888).apply {
                eraseColor(android.graphics.Color.GREEN)
            }
        resolver.openOutputStream(imageUri)?.use {
            bitmap.compress(Bitmap.CompressFormat.WEBP_LOSSLESS, 100, it)
        }
        bitmap.recycle()
        val filename = "JournalBear-photo-${UUID.randomUUID()}.zjournal"
        try {
            createJournal(filename)
            compose.onNodeWithText("New entry", useUnmergedTree = true).performClick()
            compose.onNodeWithText("Add photos").performScrollTo().performClick()
            val photo =
                device.wait(Until.findObject(By.descContains("Photo taken")), 10_000)
                    ?: device.wait(
                        Until.findObject(By.res(Pattern.compile(".*:id/icon_thumbnail"))),
                        5_000,
                    )
            checkNotNull(photo) { "Photo picker did not show the test image" }.click()
            val add = device.wait(Until.findObject(By.text("Done")), 5_000)
            checkNotNull(add) { "Photo picker did not show Done" }.click()
            awaitText("Save entry")
            compose.waitUntil(10_000) {
                compose
                    .onAllNodes(androidx.compose.ui.test.hasContentDescription("Attached photo 1"))
                    .fetchSemanticsNodes()
                    .isNotEmpty()
            }
            compose.onNodeWithText("Save entry").performClick()
            awaitText("Entry saved")
            compose.onNodeWithContentDescription("Journal photo").assertIsDisplayed()
            captureScreen("photo")
            try {
                val loaded = JournalFile.open(readDownload(filename), password.toCharArray())
                assertEquals(1, loaded.single().images.size)
                val image = loaded.single().images.single()
                assertTrue(image.name.endsWith(".jpg"))
                assertEquals(0xff, image.bytes[0].toInt() and 0xff)
                assertEquals(0xd8, image.bytes[1].toInt() and 0xff)
                compose.onNodeWithContentDescription("Journal options").performClick()
                compose.onNodeWithText("Close journal").performClick()
                openJournal(filename, password)
                awaitText("Photo entry")
                compose.onNodeWithText("Photo entry").performClick()
                compose.onNodeWithContentDescription("Journal photo").assertIsDisplayed()
            } finally {
                device.executeShellCommand("rm /sdcard/Download/$filename")
            }
        } finally {
            resolver.delete(imageUri, null, null)
        }
    }

    @Test
    fun saveAsIncludesTheDraftAndSubsequentSavesUseTheNewFile() {
        val original = "JournalBear-original-${UUID.randomUUID()}.zjournal"
        val copy = "JournalBear-copy-${UUID.randomUUID()}.zjournal"
        try {
            createJournal(original)
            compose.onNodeWithText("New entry", useUnmergedTree = true).performClick()
            compose.onNodeWithText("What's on your mind?").performTextInput("Included draft")
            compose.onNodeWithContentDescription("Journal options").performClick()
            compose.onNodeWithText("Save as").performClick()
            chooseSaveLocation(copy)
            awaitText("Entry saved")
            compose.onNodeWithContentDescription("Back").performClick()
            compose.onNodeWithText(copy.removeSuffix(".zjournal")).assertIsDisplayed()
            compose.onNodeWithText("New entry", useUnmergedTree = true).performClick()
            compose.onNodeWithText("What's on your mind?").performTextInput("Saved to the new file")
            compose.onNodeWithText("Save entry").performClick()
            compose.waitUntil(15_000) {
                compose.onAllNodes(hasText("Save entry")).fetchSemanticsNodes().isEmpty()
            }
            assertTrue(JournalFile.open(readDownload(original), password.toCharArray()).isEmpty())
            assertEquals(
                listOf("Included draft", "Saved to the new file"),
                JournalFile.open(readDownload(copy), password.toCharArray()).map { it.content },
            )
        } finally {
            device.executeShellCommand("rm -f /sdcard/Download/$original /sdcard/Download/$copy")
        }
    }

    private fun createJournal(filename: String) {
        compose.onNodeWithText("Create journal").performClick()
        compose.onNodeWithText("Password").performTextInput(password)
        compose.onNodeWithText("Confirm password").performTextInput(password)
        compose.onNodeWithText("Choose location").performClick()
        chooseSaveLocation(filename)
        awaitText("Your story starts here")
    }

    private fun chooseSaveLocation(filename: String) {
        val title = device.wait(Until.findObject(By.clazz("android.widget.EditText")), 10_000)
        checkNotNull(title) { "System save picker did not open" }.text = filename
        val save =
            device.wait(
                Until.findObject(By.text(Pattern.compile("Save", Pattern.CASE_INSENSITIVE))),
                5_000,
            )
        checkNotNull(save) { "System save picker did not show Save" }.click()
    }

    private fun openJournal(filename: String, candidate: String) {
        compose.onNodeWithText("Open journal").performClick()
        val file = device.wait(Until.findObject(By.text(filename)), 10_000)
        checkNotNull(file) { "Saved journal missing from the system file picker" }.click()
        awaitText("Unlock journal")
        compose.onNodeWithText("Password").performTextInput(candidate)
        compose.onNodeWithText("Unlock", substring = false).performClick()
    }

    private fun awaitText(text: String) {
        compose.waitUntil(15_000) {
            compose.onAllNodes(hasText(text)).fetchSemanticsNodes().isNotEmpty()
        }
    }

    private fun readDownload(filename: String): ByteArray {
        // DocumentsUI owns the saved MediaStore row. The test shell can inspect the
        // synthetic file without adding broad storage permissions to the app.
        val encoded = device.executeShellCommand("base64 /sdcard/Download/$filename")
        return java.util.Base64.getMimeDecoder().decode(encoded)
    }

    private fun captureScreen(name: String) {
        val directory =
            java.io.File(compose.activity.getExternalFilesDir(null), "test-evidence").apply {
                mkdirs()
            }
        val bitmap = compose.onRoot().captureToImage().asAndroidBitmap()
        val output = java.io.File(directory, "$name.png")
        output.outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
        device.executeShellCommand("mkdir -p /sdcard/Download/JournalBear-evidence")
        device.executeShellCommand(
            "cp ${output.absolutePath} /sdcard/Download/JournalBear-evidence/$name.png"
        )
    }
}
