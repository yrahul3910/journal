package com.yrahul.journalbear

import java.time.LocalDate
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class EntryDraftTest {
    @Test
    fun anUntouchedDraftKeepsItsCreationDateAsTheBaseline() {
        val yesterday = LocalDate.now().minusDays(1)
        val draft = EntryDraft(initialDate = yesterday)
        assertFalse(draft.hasChanges)
        assertTrue(draft.copy(date = yesterday.plusDays(1)).hasChanges)
        assertFalse(draft.copy(date = yesterday.plusDays(1)).copy(date = yesterday).hasChanges)
        assertTrue(draft.copy(content = "An entry").hasChanges)
        assertTrue(draft.copy(sentiment = "Happy").hasChanges)
    }
}
