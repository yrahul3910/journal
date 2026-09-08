plugins {
    id("com.android.application") version "9.4.0" apply false
    id("org.jetbrains.kotlin.plugin.compose") version "2.3.20" apply false
    id("org.jetbrains.kotlin.plugin.serialization") version "2.3.20" apply false
    id("com.diffplug.spotless") version "8.3.0"
}

spotless {
    kotlin {
        target("app/src/**/*.kt")
        ktfmt("0.61").kotlinlangStyle()
    }
    kotlinGradle {
        target("*.gradle.kts", "app/*.gradle.kts")
        ktfmt("0.61").kotlinlangStyle()
    }
}
