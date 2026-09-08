package com.yrahul.journalbear

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import android.util.AtomicFile
import com.yrahul.journalbear.core.JournalException
import com.yrahul.journalbear.core.JournalFile
import com.yrahul.journalbear.core.readLimited
import java.io.File
import java.io.IOException

class JournalStorage(private val context: Context) {
    private val recovery = AtomicFile(File(context.noBackupFilesDir, "recovery.zjournal"))

    val hasRecovery: Boolean
        get() = recovery.baseFile.exists() || File(recovery.baseFile.path + ".bak").exists()

    fun read(uri: Uri): ByteArray =
        context.contentResolver.openInputStream(uri)?.use {
            it.readLimited(JournalFile.MAX_FILE_BYTES)
        } ?: throw JournalException("This file could not be opened.")

    fun readRecovery(): ByteArray =
        recovery.openRead().use { it.readLimited(JournalFile.MAX_FILE_BYTES) }

    fun discardRecovery() {
        recovery.delete()
    }

    fun name(uri: Uri): String {
        context.contentResolver
            .query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)
            ?.use { cursor -> if (cursor.moveToFirst()) return cursor.getString(0) }
        return "Journal.zjournal"
    }

    fun write(uri: Uri, bytes: ByteArray) {
        // Document providers do not promise atomic writes. Keep the complete encrypted
        // replacement locally until the provider has accepted and verified every byte.
        val staged = recovery.startWrite()
        try {
            staged.write(bytes)
            recovery.finishWrite(staged)
        } catch (error: IOException) {
            recovery.failWrite(staged)
            throw error
        }
        context.contentResolver.openOutputStream(uri, "wt")?.use { it.write(bytes) }
            ?: throw JournalException("This location cannot be written. Try saving a copy.")
        if (!read(uri).contentEquals(bytes))
            throw JournalException("The saved file could not be verified. Try saving a copy.")
        recovery.delete()
    }
}
