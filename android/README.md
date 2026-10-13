# Personal Investment OS - Android Native Share Intent Wrapper

This specification provides the lightweight Android Studio wrapper configuration to enable Android native app sharing (`ACTION_SEND`) directly into the Personal Investment OS Website Vault.

---

## 1. `AndroidManifest.xml` Configuration

Add the `<intent-filter>` to your `MainActivity` inside `app/src/main/AndroidManifest.xml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.personal.investmentos">

    <!-- Network permissions for WebView / Trusted Web Activity -->
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />

    <application
        android:allowBackup="true"
        android:icon="@mipmap/ic_launcher"
        android:label="Investment OS"
        android:roundIcon="@mipmap/ic_launcher_round"
        android:supportsRtl="true"
        android:theme="@style/Theme.AppCompat.NoActionBar">

        <activity
            android:name=".MainActivity"
            android:exported="true"
            android:launchMode="singleTask"
            android:windowSoftInputMode="adjustResize">

            <!-- Main App Launcher -->
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>

            <!-- Native Android Sharesheet Intent Target for Web Links and Text -->
            <intent-filter android:label="Save to Website Vault">
                <action android:name="android.intent.action.SEND" />
                <category android:name="android.intent.category.DEFAULT" />
                <data android:mimeType="text/plain" />
            </intent-filter>

        </activity>
    </application>
</manifest>
```

---

## 2. `MainActivity.kt` (Kotlin Implementation)

```kotlin
package com.personal.investmentos

import android.annotation.SuppressLint
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity
import java.net.URLEncoder
import java.nio.charset.StandardCharsets

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private val BASE_APP_URL = "https://ais-dev-7art6xtm4ogikosrdtfzmb-636454193316.asia-east1.run.app/index.html"

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        webView = WebView(this)
        setContentView(webView)

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            cacheMode = WebSettings.LOAD_DEFAULT
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
        }

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView?, url: String?): Boolean {
                return false
            }
        }

        // Process initial cold launch intent
        val launchUrl = buildUrlFromIntent(intent)
        webView.loadUrl(launchUrl)
    }

    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        setIntent(intent)
        // Handle warm share launch while app was in background
        val shareUrl = buildUrlFromIntent(intent)
        webView.loadUrl(shareUrl)
    }

    private fun buildUrlFromIntent(intent: Intent?): String {
        if (intent == null || intent.action != Intent.ACTION_SEND || intent.type != "text/plain") {
            return BASE_APP_URL
        }

        val sharedText = intent.getStringExtra(Intent.EXTRA_TEXT) ?: ""
        val sharedSubject = intent.getStringExtra(Intent.EXTRA_SUBJECT) ?: ""

        if (sharedText.isBlank() && sharedSubject.isBlank()) {
            return BASE_APP_URL
        }

        val encodedText = URLEncoder.encode(sharedText, StandardCharsets.UTF_8.toString())
        val encodedTitle = URLEncoder.encode(sharedSubject, StandardCharsets.UTF_8.toString())

        return "$BASE_APP_URL?share_target=1&text=$encodedText&title=$encodedTitle"
    }

    override fun onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }
}
```

---

## 3. Testing with Android Debug Bridge (ADB)

Simulate native Android sharesheet invocations directly from your workstation:

```bash
# 1. Share URL with Title
adb shell am start -a android.intent.action.SEND \
  -t "text/plain" \
  -c android.intent.category.DEFAULT \
  --es android.intent.extra.TEXT "https://zerodha.com" \
  --es android.intent.extra.SUBJECT "Zerodha Kite" \
  com.personal.investmentos/.MainActivity

# 2. Share Banking URL (Auto-detected as Banking & Finance)
adb shell am start -a android.intent.action.SEND \
  -t "text/plain" \
  --es android.intent.extra.TEXT "https://netbanking.hdfcbank.com" \
  com.personal.investmentos/.MainActivity

# 3. Share Freeform Text snippet containing URL
adb shell am start -a android.intent.action.SEND \
  -t "text/plain" \
  --es android.intent.extra.TEXT "Check out this gold portal: https://tanishq.co.in" \
  com.personal.investmentos/.MainActivity
```
