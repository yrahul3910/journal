package com.yrahul.journalbear.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Visibility
import androidx.compose.material.icons.outlined.VisibilityOff
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp

@Composable
fun PasswordDialog(isNew: Boolean, onDismiss: () -> Unit, onSubmit: (String) -> Unit) {
    var password by remember { mutableStateOf("") }
    var confirmation by remember { mutableStateOf("") }
    var isVisible by remember { mutableStateOf(false) }
    val focus = remember { FocusRequester() }
    val isValid =
        password.isNotEmpty() && (!isNew || (password.length >= 8 && password == confirmation))
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (isNew) "Create journal" else "Unlock journal") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                if (isNew)
                    Text("Choose a password of at least 8 characters. There is no password reset.")
                OutlinedTextField(
                    value = password,
                    onValueChange = { password = it },
                    modifier = Modifier.focusRequester(focus),
                    label = { Text("Password") },
                    singleLine = true,
                    visualTransformation =
                        if (isVisible) VisualTransformation.None
                        else PasswordVisualTransformation(),
                    keyboardOptions =
                        KeyboardOptions(
                            keyboardType = KeyboardType.Password,
                            imeAction = if (isNew) ImeAction.Next else ImeAction.Done,
                        ),
                    keyboardActions = KeyboardActions(onDone = { if (isValid) onSubmit(password) }),
                    trailingIcon = {
                        IconButton(onClick = { isVisible = !isVisible }) {
                            Icon(
                                if (isVisible) Icons.Outlined.VisibilityOff
                                else Icons.Outlined.Visibility,
                                if (isVisible) "Hide password" else "Show password",
                            )
                        }
                    },
                )
                if (isNew)
                    OutlinedTextField(
                        value = confirmation,
                        onValueChange = { confirmation = it },
                        label = { Text("Confirm password") },
                        singleLine = true,
                        visualTransformation = PasswordVisualTransformation(),
                        keyboardOptions =
                            KeyboardOptions(
                                keyboardType = KeyboardType.Password,
                                imeAction = ImeAction.Done,
                            ),
                        keyboardActions =
                            KeyboardActions(onDone = { if (isValid) onSubmit(password) }),
                        isError = confirmation.isNotEmpty() && password != confirmation,
                    )
            }
        },
        confirmButton = {
            TextButton(onClick = { onSubmit(password) }, enabled = isValid) {
                Text(if (isNew) "Choose location" else "Unlock")
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
    LaunchedEffect(Unit) { focus.requestFocus() }
}
