package com.yrahul.journalbear.core

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Test

class JournalTest {
    @Test
    fun attachmentAndEntryEqualityCompareImageContent() {
        val image = Attachment("photo.jpg", byteArrayOf(1, 2, 3))
        val copy = image.copy(bytes = image.bytes.copyOf())
        assertEquals(image, copy)
        assertEquals(image.hashCode(), copy.hashCode())
        assertEquals(1, setOf(image, copy).size)
        assertNotEquals(image, image.copy(name = "other.jpg"))
        assertNotEquals(image, image.copy(bytes = byteArrayOf(1, 2, 4)))
        val entry = JournalEntry("2026-01-01", "Photo", images = listOf(image))
        assertEquals(entry, entry.copy(images = listOf(copy)))
        assertEquals(entry.hashCode(), entry.copy(images = listOf(copy)).hashCode())
    }

    @Test
    fun parsesDateFormsWithoutShiftingLocalCalendarDates() {
        assertEquals(Instant.parse("2024-01-01T00:00:00Z"), parseJournalDate("1704067200"))
        assertEquals(Instant.parse("2024-01-01T00:00:00Z"), parseJournalDate("1704067200000"))
        assertEquals(
            Instant.parse("2024-01-01T00:00:00Z"),
            parseJournalDate("2024-01-01T02:00:00+02:00"),
        )
        assertEquals(
            LocalDate.of(2024, 1, 1),
            parseJournalDate("2024-01-01")?.atZone(ZoneId.systemDefault())?.toLocalDate(),
        )
        assertEquals(
            parseJournalDate("2024-01-01T12:00:00"),
            parseJournalDate("2024-01-01 12:00:00"),
        )
        listOf("", "not a date", "NaN", "Infinity", "1e99").forEach {
            assertNull(parseJournalDate(it))
        }
    }

    @Test
    fun searchMatchesAllWordsAcrossContentMoodAndDateAndSortsNewestFirst() {
        val first = JournalEntry("2024-01-01", "A walk in the woods", "Happy")
        val second = JournalEntry("2025-01-01", "At home", "Neutral")
        val unknown = JournalEntry("unknown", "A walk", "Sad")
        val entries = listOf(first, unknown, second)
        assertEquals(listOf(second, first, unknown), visibleEntries(entries, " "))
        assertEquals(listOf(first), visibleEntries(entries, " WALK happy  2024 "))
        assertEquals(emptyList<JournalEntry>(), visibleEntries(entries, "beach"))
        assertEquals("unknown", unknown.displayDate)
    }
}
