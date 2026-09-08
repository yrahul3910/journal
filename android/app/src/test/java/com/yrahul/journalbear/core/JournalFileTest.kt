package com.yrahul.journalbear.core

import java.io.ByteArrayOutputStream
import java.io.File
import java.util.Base64
import java.util.zip.GZIPOutputStream
import javax.crypto.Cipher
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.IvParameterSpec
import javax.crypto.spec.PBEKeySpec
import javax.crypto.spec.SecretKeySpec
import org.apache.commons.compress.archivers.tar.TarArchiveEntry
import org.apache.commons.compress.archivers.tar.TarArchiveOutputStream
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Test

class JournalFileTest {
    private val password = "test-password".toCharArray()

    @Test
    fun roundTripPreservesEntriesAndImageBytes() {
        val image = Attachment("photo.png", byteArrayOf(1, 2, 3, 4))
        val entries =
            listOf(
                JournalEntry("2026-09-08", "# A day\n\nHello, \u4e16\u754c", "Happy", listOf(image))
            )
        val encrypted = JournalFile.encrypt(entries, password)
        val loaded = JournalFile.open(encrypted, password).single()
        assertEquals(entries.single().content, loaded.content)
        assertEquals("2026-09-08", loaded.entryDate)
        assertEquals("Happy", loaded.sentiment)
        assertArrayEquals(image.bytes, loaded.images.single().bytes)
        assertEquals(
            emptyList<JournalEntry>(),
            JournalFile.open(JournalFile.encrypt(emptyList(), password), password),
        )
        assertFalse(encrypted.contentEquals(JournalFile.encrypt(entries, password)))
    }

    @Test
    fun opensSwiftFixtureAndProducesFileForSwiftVerification() {
        val fixture = checkNotNull(javaClass.getResource("/swift-v7.b64")).readText().trim()
        val secret = "interop-\u00e9-\uD83D\uDC3B".toCharArray()
        val loaded = JournalFile.open(Base64.getDecoder().decode(fixture), secret)
        assertEquals("# Shared journal\n\nHello from Swift.", loaded.single().content)
        assertEquals("Loved", loaded.single().sentiment)
        assertEquals(1, loaded.single().images.size)
        File("build/interop-android.zjournal").writeBytes(JournalFile.encrypt(loaded, secret))
    }

    @Test
    fun rejectsWrongPasswordTruncatedAndCorruptFiles() {
        val bytes = JournalFile.encrypt(listOf(JournalEntry("2026-01-01", "Test")), password)
        assertThrows(JournalException::class.java) {
            JournalFile.open(bytes, "wrong".toCharArray())
        }
        assertThrows(JournalException::class.java) { JournalFile.open(bytes.copyOf(31), password) }
        assertThrows(JournalException::class.java) {
            JournalFile.open(bytes.copyOf(bytes.size - 1), password)
        }
        bytes[bytes.lastIndex] = (bytes.last() + 1).toByte()
        assertThrows(JournalException::class.java) { JournalFile.open(bytes, password) }
    }

    @Test
    fun requiresVersionSevenAndEntriesKey() {
        listOf(
                """{"version":6,"entries":[]}""",
                """{"version":8,"entries":[]}""",
                """{"version":7,"en":[]}""",
                """{"entries":[]}""",
                """{"version":7,"entries":[{"entryDate":false,"content":"x"}]}""",
            )
            .forEach { json ->
                assertThrows(JournalException::class.java) {
                    JournalFile.open(
                        archive(listOf("data.json" to json.encodeToByteArray())),
                        password,
                    )
                }
            }
    }

    @Test
    fun acceptsNumericDatesAndOptionalMoodAndAttachments() {
        val json = """{"version":7,"entries":[{"entryDate":1704067200000,"content":"Test"}]}"""
        val entry =
            JournalFile.open(archive(listOf("data.json" to json.encodeToByteArray())), password)
                .single()
        assertEquals("1704067200000", entry.entryDate)
        assertEquals("Neutral", entry.sentiment)
        assertEquals(emptyList<Attachment>(), entry.images)
    }

    @Test
    fun rejectsMissingImagesDuplicatePathsAndTraversal() {
        val missingImage =
            """{"version":7,"entries":[{"entryDate":"2026-01-01","content":"Test","attachments":["images/missing.png"]}]}"""
                .encodeToByteArray()
        val valid = """{"version":7,"entries":[]}""".encodeToByteArray()
        listOf(
                listOf("data.json" to missingImage),
                listOf("data.json" to valid, "data.json" to valid),
                listOf("data.json" to valid, "../outside" to byteArrayOf(1)),
                listOf("other.json" to valid),
            )
            .forEach { files ->
                assertThrows(JournalException::class.java) {
                    JournalFile.open(archive(files), password)
                }
            }
    }

    @Test
    fun limitsReadsAndRejectsOversizedImages() {
        assertArrayEquals(byteArrayOf(1, 2), byteArrayOf(1, 2).inputStream().readLimited(2))
        assertThrows(JournalException::class.java) {
            byteArrayOf(1, 2, 3).inputStream().readLimited(2)
        }
        val entry =
            JournalEntry(
                "2026-01-01",
                "Photo",
                images = listOf(Attachment("large.jpg", ByteArray(JournalFile.MAX_IMAGE_BYTES + 1))),
            )
        assertThrows(JournalException::class.java) { JournalFile.encrypt(listOf(entry), password) }
    }

    private fun archive(files: List<Pair<String, ByteArray>>): ByteArray {
        val compressed = ByteArrayOutputStream()
        TarArchiveOutputStream(GZIPOutputStream(compressed)).use { tar ->
            files.forEach { (name, content) ->
                tar.putArchiveEntry(TarArchiveEntry(name).apply { size = content.size.toLong() })
                tar.write(content)
                tar.closeArchiveEntry()
            }
        }
        val salt = ByteArray(16) { it.toByte() }
        val iv = ByteArray(16) { (it + 16).toByte() }
        val key =
            SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256")
                .generateSecret(PBEKeySpec(password, salt, 100_000, 256))
                .encoded
        val cipher = Cipher.getInstance("AES/CBC/PKCS5Padding")
        cipher.init(Cipher.ENCRYPT_MODE, SecretKeySpec(key, "AES"), IvParameterSpec(iv))
        return salt + iv + cipher.doFinal(compressed.toByteArray())
    }
}
