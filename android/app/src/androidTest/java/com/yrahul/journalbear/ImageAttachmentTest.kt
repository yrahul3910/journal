package com.yrahul.journalbear

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import androidx.test.filters.SdkSuppress
import androidx.test.platform.app.InstrumentationRegistry
import com.yrahul.journalbear.core.JournalException
import java.io.ByteArrayOutputStream
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class ImageAttachmentTest {
    @Test
    @SdkSuppress(minSdkVersion = 28)
    fun heicIsConvertedToJpegAndPreservesDisplayOrientation() {
        val bytes =
            InstrumentationRegistry.getInstrumentation().context.assets.open("green.heic").use {
                it.readBytes()
            }
        val image = prepareImageAttachment(bytes)
        assertTrue(image.name.endsWith(".jpg"))
        val decoded = checkNotNull(BitmapFactory.decodeByteArray(image.bytes, 0, image.bytes.size))
        try {
            assertEquals(16, decoded.width)
            assertEquals(32, decoded.height)
            assertTrue(Color.green(decoded.getPixel(5, 5)) > 240)
        } finally {
            decoded.recycle()
        }
    }

    @Test
    @SdkSuppress(minSdkVersion = 30)
    fun oddImageDimensionsCannotRoundAboveTheSamplingLimit() {
        val bitmap = Bitmap.createBitmap(8193, 100, Bitmap.Config.ARGB_8888)
        val output = ByteArrayOutputStream()
        try {
            assertTrue(bitmap.compress(Bitmap.CompressFormat.WEBP_LOSSLESS, 100, output))
        } finally {
            bitmap.recycle()
        }
        val image = prepareImageAttachment(output.toByteArray())
        val decoded = checkNotNull(BitmapFactory.decodeByteArray(image.bytes, 0, image.bytes.size))
        try {
            assertTrue(decoded.width in 2048..2049)
            assertEquals(25, decoded.height)
        } finally {
            decoded.recycle()
        }
    }

    @Test
    fun pngAndJpegArePreservedByteForByte() {
        for ((format, extension) in
            listOf(Bitmap.CompressFormat.PNG to "png", Bitmap.CompressFormat.JPEG to "jpg")) {
            val bitmap = Bitmap.createBitmap(32, 16, Bitmap.Config.ARGB_8888)
            val output = ByteArrayOutputStream()
            try {
                bitmap.eraseColor(Color.GREEN)
                assertTrue(bitmap.compress(format, 90, output))
            } finally {
                bitmap.recycle()
            }
            val bytes = output.toByteArray()
            val image = prepareImageAttachment(bytes)
            assertTrue(image.name.endsWith(".$extension"))
            assertArrayEquals(bytes, image.bytes)
        }
    }

    @Test
    @SdkSuppress(minSdkVersion = 30)
    fun webpIsConvertedToJpegWithBoundedDimensions() {
        val bitmap = Bitmap.createBitmap(5000, 100, Bitmap.Config.ARGB_8888)
        val output = ByteArrayOutputStream()
        try {
            bitmap.eraseColor(Color.GREEN)
            assertTrue(bitmap.compress(Bitmap.CompressFormat.WEBP_LOSSLESS, 100, output))
        } finally {
            bitmap.recycle()
        }
        val image = prepareImageAttachment(output.toByteArray())
        assertTrue(image.name.endsWith(".jpg"))
        val decoded = checkNotNull(BitmapFactory.decodeByteArray(image.bytes, 0, image.bytes.size))
        try {
            assertEquals(2500, decoded.width)
            assertEquals(50, decoded.height)
            assertTrue(Color.green(decoded.getPixel(100, 10)) > 240)
        } finally {
            decoded.recycle()
        }
    }

    @Test
    fun rejectsUndecodableImages() {
        assertThrows(JournalException::class.java) { prepareImageAttachment(byteArrayOf(1, 2, 3)) }
    }
}
