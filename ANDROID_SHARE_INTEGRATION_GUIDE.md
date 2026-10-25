# Android Share to Website Vault Integration Guide

This guide details how Android devices share URLs and web pages directly into **Personal Investment OS Website Vault** via:
1. **PWA Web Share Target** (Zero compilation required; works directly when added to Home Screen in Chrome / Edge / Samsung Internet).
2. **Native Android APK / TWA Wrapper** (For building a standalone Google Play Store APK using Android Studio).

---

## 1. PWA Web Share Target (Zero Compilation)

### How It Works
When you install **Personal Investment OS** on your Android device via Chrome:
1. Chrome parses the Web App Manifest (`manifest.json`), which now includes:
   ```json
   "share_target": {
     "action": "./index.html",
     "method": "GET",
     "params": {
       "title": "title",
       "text": "text",
       "url": "url"
     }
   }
   ```
2. Android registers **Investment OS** as a valid system handler in Android's native Sharesheet.
3. Whenever you tap **Share** in Chrome, Firefox, Twitter/X, or any Android app, **Investment OS** appears in the share grid.
4. When tapped, Android passes the URL, page title, and description directly to `js/lib/shareTarget.js`, which:
   - Validates the link (HTTP/HTTPS only).
   - Auto-detects the vault category (e.g., *Banking & Finance*, *Recharge & Utilities*, *Stocks & Mutual Funds*).
   - Immediately commits the entry to your Supabase `website_entries` table.
   - Displays a success confirmation toast.
   - Opens your Website Vault (`#vault`) and animates the newly added card with a glowing highlight.

### Testing on Your Android Phone via PWA
1. Open Chrome on Android and navigate to your deployed app:
   `https://ais-dev-7art6xtm4ogikosrdtfzmb-636454193316.asia-east1.run.app` (or your custom domain)
2. Tap Chrome's three dots (`⋮`) $\rightarrow$ **Install App** (or **Add to Home screen**).
3. Once installed, open Chrome, visit any website (e.g. `https://zerodha.com` or `https://netbanking.hdfcbank.com`).
4. Tap Chrome menu $\rightarrow$ **Share** $\rightarrow$ select **Investment OS**.
5. Investment OS opens automatically, saves the link to your Website Vault, displays a toast, and scrolls to the highlighted entry.

---

## 2. Standalone Android APK Integration (Native Android Studio Project)

If you are packaging Investment OS into a standalone Android APK using a WebView or Trusted Web Activity (TWA), use the minimal configuration below.

### A. AndroidManifest.xml (`app/src/main/AndroidManifest.xml`)
Register an `<intent-filter>` for `ACTION_SEND` with MIME type `text/plain` inside your `<activity>`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.personalinvestmentos.app">

    <uses-permission android:name="android.permission.INTERNET" />

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
            android:configChanges="orientation|keyboardHidden|screenSize">

            <!-- Standard Main Launcher -->
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>

            <!-- Android Sharesheet Receiver for URLs and Plain Text -->
            <intent-filter>
                <action android:name="android.intent.action.SEND" />
                <category android:name="android.intent.category.DEFAULT" />
                <data android:mimeType="text/plain" />
            </intent-filter>

        </activity>
    </application>
</manifest>
```

### B. MainActivity.kt (Handles Cold Launch & Warm App States)

```kotlin
package com.personalinvestmentos.app

import android.content.Intent
import android.os.Bundle
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity
import java.net.URLEncoder

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private val BASE_URL = "https://ais-dev-7art6xtm4ogikosrdtfzmb-636454193316.asia-east1.run.app"

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        webView = findViewById(R.id.webView)
        webView.webViewClient = WebViewClient()
        val settings: WebSettings = webView.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.databaseEnabled = true

        // Handle cold launch share intent
        val initialUrl = parseShareIntent(intent) ?: BASE_URL
        webView.loadUrl(initialUrl)
    }

    // Handles warm launch (when app is already running in background)
    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        setIntent(intent)
        parseShareIntent(intent)?.let { shareUrl ->
            webView.loadUrl(shareUrl)
        }
    }

    private fun parseShareIntent(intent: Intent?): String? {
        if (intent == null || intent.action != Intent.ACTION_SEND) return null
        if ("text/plain" != intent.type) return null

        val sharedText = intent.getStringExtra(Intent.EXTRA_TEXT) ?: ""
        val sharedSubject = intent.getStringExtra(Intent.EXTRA_SUBJECT) ?: ""

        val encText = URLEncoder.encode(sharedText, "UTF-8")
        val encTitle = URLEncoder.encode(sharedSubject, "UTF-8")

        // Dispatches to Investment OS Share Target endpoint
        return "$BASE_URL/?share_target=1&text=$encText&title=$encTitle"
    }
}
```

---

## 3. Handled Scenarios & Edge Cases

| Scenario | Behavior in Investment OS |
|---|---|
| **Chrome Share URL only** | Extracts link, falls back title to formatted domain name (e.g. `Zerodha`), auto-saves. |
| **Share Text with embedded link** | Regex extracts `https://...` from description snippet and trims whitespace. |
| **No valid URL (Plain random text)** | Warns user with amber toast: `No valid web link found in shared content.` |
| **Unauthenticated / Logged Out** | Safely stores in `sessionStorage`. As soon as user logs in, auto-saves and highlights. |
| **Repeated shares of same URL** | Saves independent row each time (duplicates allowed). |
| **Browser reload after share** | URL parameters are stripped via `history.replaceState` and session signature prevents double-saving. |
