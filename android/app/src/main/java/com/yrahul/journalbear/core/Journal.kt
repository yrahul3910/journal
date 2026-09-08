package com.yrahul.journalbear.core

import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException
import java.time.format.FormatStyle
import java.util.UUID

data class Attachment(val name: String, val bytes: ByteArray)

data class JournalEntry(
    val entryDate: String,
    val content: String,
    val sentiment: String = "Neutral",
    val images: List<Attachment> = emptyList(),
    val id: String = UUID.randomUUID().toString(),
) {
    val date: Instant?
        get() = parseJournalDate(entryDate)

    val displayDate: String
        get() =
            date
                ?.atZone(ZoneId.systemDefault())
                ?.format(DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM)) ?: entryDate

    companion object {
        val sentiments = listOf("Happy", "Excited", "Loved", "Neutral", "Sad", "Angry")
    }
}

fun parseJournalDate(raw: String): Instant? {
    val value = raw.trim()
    value.toDoubleOrNull()?.let { epoch ->
        if (!epoch.isFinite() || kotlin.math.abs(epoch) > 100_000_000_000_000) return null
        return Instant.ofEpochMilli(
            if (kotlin.math.abs(epoch) > 10_000_000_000) epoch.toLong() else (epoch * 1000).toLong()
        )
    }
    val parsers: List<(String) -> Instant> =
        listOf(
            { OffsetDateTime.parse(it).toInstant() },
            {
                LocalDateTime.parse(it.replace(' ', 'T')).atZone(ZoneId.systemDefault()).toInstant()
            },
            { LocalDate.parse(it).atStartOfDay(ZoneId.systemDefault()).toInstant() },
        )
    for (parse in parsers) {
        try {
            return parse(value)
        } catch (_: DateTimeParseException) {
            // Journal dates can be ISO timestamps, local timestamps, or calendar dates.
        }
    }
    return null
}

fun visibleEntries(entries: List<JournalEntry>, query: String): List<JournalEntry> {
    val words = query.trim().split(Regex("\\s+")).filter(String::isNotEmpty)
    return entries
        .filter { entry ->
            val text = "${entry.content} ${entry.sentiment} ${entry.entryDate} ${entry.displayDate}"
            words.all { text.contains(it, ignoreCase = true) }
        }
        .sortedByDescending { it.date ?: Instant.MIN }
}
