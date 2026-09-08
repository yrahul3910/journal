package com.yrahul.journalbear

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ImageDecoder
import android.os.Build
import com.yrahul.journalbear.core.Attachment
import com.yrahul.journalbear.core.JournalException
import com.yrahul.journalbear.core.JournalFile
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.nio.ByteBuffer
import java.util.UUID

fun prepareImageAttachment(bytes: ByteArray): Attachment {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
    if (bounds.outWidth <= 0 || bounds.outHeight <= 0)
        throw JournalException("This image format is not supported.")
    when (bounds.outMimeType) {
        "image/png" -> return Attachment("${UUID.randomUUID()}.png", bytes)
        "image/jpeg" -> return Attachment("${UUID.randomUUID()}.jpg", bytes)
    }

    // Bound bitmap memory while converting formats the desktop reader cannot display.
    var sampleSize = 1
    while (
        bounds.outWidth.toLong() > 4096L * sampleSize ||
            bounds.outHeight.toLong() > 4096L * sampleSize
    ) sampleSize *= 2
    val bitmap =
        try {
            if (Build.VERSION.SDK_INT >= 28) {
                ImageDecoder.decodeBitmap(ImageDecoder.createSource(ByteBuffer.wrap(bytes))) {
                    decoder,
                    _,
                    _ ->
                    decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
                    decoder.setTargetSampleSize(sampleSize)
                }
            } else {
                BitmapFactory.decodeByteArray(
                    bytes,
                    0,
                    bytes.size,
                    BitmapFactory.Options().apply { inSampleSize = sampleSize },
                ) ?: throw JournalException("This image could not be decoded.")
            }
        } catch (failure: IOException) {
            throw JournalException("This image could not be decoded.", failure)
        }
    try {
        val output = ByteArrayOutputStream()
        if (!bitmap.compress(Bitmap.CompressFormat.JPEG, 90, output))
            throw JournalException("This image could not be converted to JPEG.")
        if (output.size() > JournalFile.MAX_IMAGE_BYTES)
            throw JournalException("The converted image is larger than 12 MB.")
        return Attachment("${UUID.randomUUID()}.jpg", output.toByteArray())
    } finally {
        bitmap.recycle()
    }
}
