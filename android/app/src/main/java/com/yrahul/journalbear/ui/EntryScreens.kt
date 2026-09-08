package com.yrahul.journalbear.ui

import android.widget.TextView
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import coil3.compose.AsyncImage
import com.yrahul.journalbear.core.JournalEntry
import com.yrahul.journalbear.core.visibleEntries
import io.noties.markwon.Markwon

@Composable
fun EntryList(
    entries: List<JournalEntry>,
    query: String,
    onQuery: (String) -> Unit,
    onSelect: (JournalEntry) -> Unit,
) {
    val results = remember(entries, query) { visibleEntries(entries, query) }
    Column(Modifier.fillMaxSize()) {
        OutlinedTextField(
            value = query,
            onValueChange = onQuery,
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
            label = { Text("Search entries") },
            leadingIcon = { Icon(Icons.Outlined.Search, null) },
            trailingIcon = {
                if (query.isNotEmpty())
                    IconButton(onClick = { onQuery("") }) {
                        Icon(Icons.Outlined.Close, "Clear search")
                    }
            },
            singleLine = true,
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
        )
        LazyColumn(contentPadding = PaddingValues(bottom = 96.dp)) {
            if (results.isEmpty())
                item {
                    Column(
                        Modifier.padding(24.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        Text(
                            if (entries.isEmpty()) "Your story starts here"
                            else "No matching entries",
                            style = MaterialTheme.typography.titleLarge,
                        )
                        Text(
                            if (entries.isEmpty()) "Tap New entry to write about your day."
                            else "Try another word, date, or mood."
                        )
                    }
                }
            items(results, key = { it.id }) { entry ->
                ListItem(
                    modifier = Modifier.clickable { onSelect(entry) },
                    overlineContent = { Text(entry.displayDate) },
                    headlineContent = {
                        Text(
                            entry.content.ifBlank { "Photo entry" },
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis,
                        )
                    },
                    supportingContent = {
                        Text(
                            entry.sentiment +
                                if (entry.images.isNotEmpty()) " / ${entry.images.size} photos"
                                else ""
                        )
                    },
                )
                HorizontalDivider(Modifier.padding(horizontal = 16.dp))
            }
        }
    }
}

@Composable
fun EntryDetail(entry: JournalEntry) {
    val context = LocalContext.current
    val markwon = remember(context) { Markwon.create(context) }
    val textColor = MaterialTheme.colorScheme.onSurface.toArgb()
    val linkColor = MaterialTheme.colorScheme.primary.toArgb()
    val rendered = remember(entry.content, markwon) { markwon.toMarkdown(entry.content) }
    LazyColumn(
        contentPadding = PaddingValues(start = 24.dp, end = 24.dp, top = 16.dp, bottom = 112.dp),
        verticalArrangement = Arrangement.spacedBy(20.dp),
    ) {
        item {
            Text(
                entry.sentiment,
                style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.primary,
            )
        }
        if (entry.content.isNotEmpty())
            item {
                AndroidView(
                    factory = {
                        TextView(it).apply {
                            textSize = 18f
                            setTextIsSelectable(true)
                        }
                    },
                    modifier = Modifier.fillMaxWidth(),
                    update = {
                        it.setTextColor(textColor)
                        it.setLinkTextColor(linkColor)
                        markwon.setParsedMarkdown(it, rendered)
                    },
                )
            }
        items(entry.images) { image ->
            AsyncImage(
                model = image.bytes,
                contentDescription = "Journal photo",
                modifier = Modifier.fillMaxWidth().height(300.dp),
            )
        }
    }
}

@Preview(showBackground = true)
@Composable
private fun EntryListPreview() {
    JournalTheme {
        Surface {
            EntryList(
                entries =
                    listOf(
                        JournalEntry(
                            entryDate = "2026-03-31",
                            content = "Had a wonderful walk in the park today.",
                            sentiment = "Happy",
                            id = "1",
                        ),
                        JournalEntry(
                            entryDate = "2026-03-30",
                            content = "Worked on project features and fixed some UI bugs.",
                            sentiment = "Loved",
                            id = "2",
                        ),
                    ),
                query = "",
                onQuery = {},
                onSelect = {},
            )
        }
    }
}
