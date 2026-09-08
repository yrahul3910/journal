package com.yrahul.journalbear.ui

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AddPhotoAlternate
import androidx.compose.material.icons.outlined.CalendarToday
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import com.yrahul.journalbear.EntryDraft
import com.yrahul.journalbear.core.JournalEntry
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EntryEditor(
    draft: EntryDraft,
    isBusy: Boolean,
    onChange: (EntryDraft) -> Unit,
    onImages: (List<Uri>) -> Unit,
) {
    var showDate by remember { mutableStateOf(false) }
    val photoPicker =
        rememberLauncherForActivityResult(
            ActivityResultContracts.PickMultipleVisualMedia(10),
            onImages,
        )
    Column(
        Modifier.fillMaxWidth().imePadding().verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        OutlinedButton(
            onClick = { showDate = true },
            enabled = !isBusy,
            modifier = Modifier.semantics { contentDescription = "Entry date" },
        ) {
            Icon(Icons.Outlined.CalendarToday, null, Modifier.padding(end = 8.dp).size(18.dp))
            Text(draft.date.format(DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM)))
        }
        Text("How are you feeling?", style = MaterialTheme.typography.titleSmall)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            JournalEntry.sentiments.forEach { mood ->
                FilterChip(
                    selected = draft.sentiment == mood,
                    onClick = { onChange(draft.copy(sentiment = mood)) },
                    label = { Text(mood) },
                    enabled = !isBusy,
                )
            }
        }
        OutlinedTextField(
            value = draft.content,
            onValueChange = { onChange(draft.copy(content = it)) },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("What's on your mind?") },
            supportingText = { Text("Markdown formatting is supported") },
            minLines = 8,
            enabled = !isBusy,
        )
        OutlinedButton(
            onClick = {
                photoPicker.launch(
                    PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)
                )
            },
            enabled = !isBusy,
        ) {
            Icon(Icons.Outlined.AddPhotoAlternate, null, Modifier.padding(end = 8.dp))
            Text("Add photos")
        }
        draft.images.forEachIndexed { index, image ->
            Row(Modifier.fillMaxWidth()) {
                AsyncImage(
                    model = image.bytes,
                    contentDescription = "Attached photo ${index + 1}",
                    modifier = Modifier.weight(1f).height(160.dp),
                )
                IconButton(
                    onClick = {
                        onChange(
                            draft.copy(
                                images =
                                    draft.images.filterIndexed { position, _ -> position != index }
                            )
                        )
                    },
                    enabled = !isBusy,
                ) {
                    Icon(Icons.Outlined.Close, "Remove photo ${index + 1}")
                }
            }
        }
    }
    if (showDate) {
        val datePicker =
            rememberDatePickerState(
                initialSelectedDateMillis =
                    draft.date.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli()
            )
        DatePickerDialog(
            onDismissRequest = { showDate = false },
            confirmButton = {
                TextButton(
                    onClick = {
                        datePicker.selectedDateMillis?.let {
                            onChange(
                                draft.copy(
                                    date =
                                        Instant.ofEpochMilli(it)
                                            .atZone(ZoneOffset.UTC)
                                            .toLocalDate()
                                )
                            )
                        }
                        showDate = false
                    },
                    enabled = datePicker.selectedDateMillis != null,
                ) {
                    Text("OK")
                }
            },
            dismissButton = { TextButton(onClick = { showDate = false }) { Text("Cancel") } },
        ) {
            DatePicker(state = datePicker)
        }
    }
}

@Preview(showBackground = true)
@Composable
private fun EntryEditorPreview() {
    JournalTheme {
        Surface {
            EntryEditor(
                draft =
                    EntryDraft(
                        content =
                            "Today was a great day! Managed to finish the project and go for a walk.",
                        date = LocalDate.now(),
                        sentiment = "Happy",
                    ),
                isBusy = false,
                onChange = {},
                onImages = {},
            )
        }
    }
}
