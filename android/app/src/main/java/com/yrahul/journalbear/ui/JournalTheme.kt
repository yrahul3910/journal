package com.yrahul.journalbear.ui

import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext

@Composable
fun JournalTheme(content: @Composable () -> Unit) {
    val dark = isSystemInDarkTheme()
    val context = LocalContext.current
    val colors =
        when {
            Build.VERSION.SDK_INT >= 31 ->
                if (dark) dynamicDarkColorScheme(context) else dynamicLightColorScheme(context)
            dark -> darkColorScheme(primary = Color(0xFFB0D0AA), secondary = Color(0xFFBFCBB9))
            else -> lightColorScheme(primary = Color(0xFF3E683D), secondary = Color(0xFF53634E))
        }
    MaterialTheme(colorScheme = colors, content = content)
}
