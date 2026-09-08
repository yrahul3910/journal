package com.yrahul.journalbear.core

import java.io.ByteArrayOutputStream
import java.io.IOException
import java.io.InputStream
import java.security.GeneralSecurityException
import java.security.SecureRandom
import java.util.zip.GZIPInputStream
import java.util.zip.GZIPOutputStream
import javax.crypto.Cipher
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.IvParameterSpec
import javax.crypto.spec.PBEKeySpec
import javax.crypto.spec.SecretKeySpec
import kotlinx.serialization.Serializable
import kotlinx.serialization.SerializationException
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.JsonTransformingSerializer
import kotlinx.serialization.json.doubleOrNull
import org.apache.commons.compress.archivers.tar.TarArchiveEntry
import org.apache.commons.compress.archivers.tar.TarArchiveInputStream
import org.apache.commons.compress.archivers.tar.TarArchiveOutputStream

class JournalException(message: String, cause: Throwable? = null) : IOException(message, cause)

object JournalFile {
    const val MAX_FILE_BYTES = 64 * 1024 * 1024
    const val MAX_IMAGE_BYTES = 12 * 1024 * 1024
    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
    }

    fun open(bytes: ByteArray, password: CharArray): List<JournalEntry> {
        if (bytes.size !in 48..MAX_FILE_BYTES || (bytes.size - 32) % 16 != 0) {
            throw JournalException("The journal is truncated, corrupted, or larger than 64 MB.")
        }
        val compressed =
            crypt(
                Cipher.DECRYPT_MODE,
                bytes.copyOfRange(32, bytes.size),
                password,
                bytes.copyOfRange(0, 16),
                bytes.copyOfRange(16, 32),
            )
        val files = mutableMapOf<String, ByteArray>()
        try {
            val tarball =
                GZIPInputStream(compressed.inputStream()).use { it.readLimited(MAX_FILE_BYTES) }
            TarArchiveInputStream(tarball.inputStream()).use { tar ->
                var entry = tar.nextEntry
                while (entry != null) {
                    val name = entry.name.removePrefix("./")
                    if (entry.isFile) {
                        if (
                            name.startsWith('/') ||
                                name.split('/').any { it == ".." } ||
                                files.containsKey(name)
                        ) {
                            throw JournalException(
                                "The journal contains invalid or duplicate archive paths."
                            )
                        }
                        val limit = if (name == "data.json") 4 * 1024 * 1024 else MAX_IMAGE_BYTES
                        files[name] = tar.readLimited(limit)
                    } else if (!entry.isDirectory) {
                        throw JournalException("The journal contains an unsupported archive entry.")
                    }
                    entry = tar.nextEntry
                }
            }
        } catch (error: IOException) {
            throw JournalException(
                "The journal archive is damaged or exceeds the supported size.",
                error,
            )
        }
        val data = files["data.json"] ?: throw JournalException("The journal is missing data.json.")
        val disk =
            try {
                json.decodeFromString<DiskJournal>(
                    data.decodeToString(throwOnInvalidSequence = true)
                )
            } catch (error: IllegalArgumentException) {
                throw JournalException(
                    "The journal data is invalid. Only format 7.0 is supported.",
                    error,
                )
            }
        if (disk.version != 7.0) throw JournalException("Only journal format 7.0 is supported.")
        return disk.entries.map { entry ->
            if (entry.sentiment !in JournalEntry.sentiments)
                throw JournalException("The journal contains an unsupported mood.")
            JournalEntry(
                entry.entryDate,
                entry.content,
                entry.sentiment,
                entry.attachments.map { reference ->
                    val filename = reference.substringAfterLast('/')
                    val image =
                        files["images/$filename"]
                            ?: throw JournalException("An image attachment is missing: $filename")
                    Attachment(filename, image)
                },
            )
        }
    }

    fun encrypt(entries: List<JournalEntry>, password: CharArray): ByteArray {
        val files = linkedMapOf<String, ByteArray>()
        val diskEntries =
            entries.map { entry ->
                DiskEntry(
                    entry.entryDate,
                    entry.content,
                    entry.sentiment,
                    entry.images.map { image ->
                        if (image.bytes.size > MAX_IMAGE_BYTES)
                            throw JournalException("An image is larger than 12 MB.")
                        val filename =
                            "${java.util.UUID.randomUUID()}.${image.name.substringAfterLast('.', "jpg")}"
                        files["images/$filename"] = image.bytes
                        "./_jbfiles/images/$filename"
                    },
                )
            }
        val metadata = json.encodeToString(DiskJournal(7.0, diskEntries)).encodeToByteArray()
        if (metadata.size > 4 * 1024 * 1024)
            throw JournalException("The journal text is larger than 4 MB.")
        files["data.json"] = metadata
        val archiveSize = files.values.sumOf { ((it.size.toLong() + 511) / 512 + 1) * 512 } + 1024
        if (archiveSize > MAX_FILE_BYTES)
            throw JournalException("The expanded journal is larger than 64 MB.")
        val output = ByteArrayOutputStream()
        GZIPOutputStream(output).use { gzip ->
            TarArchiveOutputStream(gzip).use { tar ->
                files.forEach { (name, data) ->
                    tar.putArchiveEntry(TarArchiveEntry(name).apply { size = data.size.toLong() })
                    tar.write(data)
                    tar.closeArchiveEntry()
                }
            }
        }
        val random = SecureRandom()
        val salt = ByteArray(16).also(random::nextBytes)
        val iv = ByteArray(16).also(random::nextBytes)
        val result =
            salt + iv + crypt(Cipher.ENCRYPT_MODE, output.toByteArray(), password, salt, iv)
        if (result.size > MAX_FILE_BYTES)
            throw JournalException("The encrypted journal is larger than 64 MB.")
        return result
    }

    private fun crypt(
        mode: Int,
        bytes: ByteArray,
        password: CharArray,
        salt: ByteArray,
        iv: ByteArray,
    ): ByteArray {
        val specification = PBEKeySpec(password, salt, 100_000, 256)
        try {
            val key =
                SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256")
                    .generateSecret(specification)
                    .encoded
            try {
                val cipher = Cipher.getInstance("AES/CBC/PKCS5Padding")
                cipher.init(mode, SecretKeySpec(key, "AES"), IvParameterSpec(iv))
                return cipher.doFinal(bytes)
            } finally {
                key.fill(0)
            }
        } catch (error: GeneralSecurityException) {
            throw JournalException("Wrong password, or the journal is corrupted.", error)
        } finally {
            specification.clearPassword()
        }
    }
}

fun InputStream.readLimited(limit: Int): ByteArray {
    val output = ByteArrayOutputStream()
    val buffer = ByteArray(8192)
    var count = read(buffer)
    while (count != -1) {
        if (output.size().toLong() + count > limit)
            throw JournalException("The file exceeds the supported size.")
        output.write(buffer, 0, count)
        count = read(buffer)
    }
    return output.toByteArray()
}

@Serializable private data class DiskJournal(val version: Double, val entries: List<DiskEntry>)

@Serializable
private data class DiskEntry(
    @Serializable(with = JournalDateSerializer::class) val entryDate: String,
    val content: String,
    val sentiment: String = "Neutral",
    val attachments: List<String> = emptyList(),
)

private object JournalDateSerializer : JsonTransformingSerializer<String>(String.serializer()) {
    override fun transformDeserialize(element: JsonElement): JsonElement {
        if (element is JsonPrimitive && (element.isString || element.doubleOrNull != null)) {
            return JsonPrimitive(element.content)
        }
        throw SerializationException("Invalid entry date")
    }
}
