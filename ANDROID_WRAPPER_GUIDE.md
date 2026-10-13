# Android Native APK Intent Wrapper Specification

This guide provides complete, production-grade instructions for scaffolding a lightweight Android APK wrapper around the **Personal Investment OS** Progressive Web App (PWA). It enables the app to be installed as a standalone APK on Android devices while natively registering for the Android OS Sharesheet via `android.intent.action.SEND`.

---

## 1. Architectural Overview

There are two primary approaches for packaging Personal Investment OS as an Android APK:

| Architecture | Engine | Advantages | Recommended For |
| :--- | :--- | :--- | :--- |
| **Option A: Trusted Web Activity (TWA)** | Chromium (system Chrome / WebLayer) | Best performance, full modern PWA & Service Worker capabilities, shared cookies, smallest APK size (~1-2 MB). | **Recommended for production builds.** |
| **Option B: Lightweight Native WebView** | Android system `android.webkit.WebView` | Completely self-contained, independent storage, customizable ChromeClient. | Specialized enterprise or private distribution. |

Both approaches intercept `ACTION_SEND` intents dispatched from Android Chrome, Firefox, social apps, and news readers, mapping shared URLs and titles directly to the Investment OS Web Share Target URL handler.

---

## 2. Option A: Trusted Web Activity (TWA) with Share Activity (Recommended)

### A. Add AndroidX Browser Dependency in `app/build.gradle`

```groovy
dependencies {
    implementation 'androidx.browser:browser:1.8.0'
    implementation 'com.google.androidbrowserhelper:androidbrowserhelper:2.5.0'
}
```

### B. `AndroidManifest.xml` Configuration

Configure `AndroidManifest.xml` with both the main TWA launcher activity and a dedicated `ShareActivity` configured with the `ACTION_SEND` intent-filter:

```xml
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.personalinvestmentos.app">

    <uses-permission android:name="android.permission.INTERNET" />

    <application
        android:allowBackup="true"
        android:icon="@mipmap/ic_launcher"
        android:label="@string/app_name"
        android:roundIcon="@mipmap/ic_launcher_round"
        android:supportsRtl="true"
        android:theme="@android:style/Theme.NoTitleBar">

        <!-- 1. Main TWA Launcher Activity -->
        <activity
            android:name="com.google.androidbrowserhelper.trusted.LauncherActivity"
            android:exported="true"
            android:label="@string/app_name">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>

            <!-- TWA metadata: your deployed Investment OS origin -->
            <meta-data
                android:name="android.support.customtabs.trusted.DEFAULT_URL"
                android:value="https://YOUR_INVESTMENT_OS_DOMAIN/" />
        </activity>

        <!-- 2. Share Target Interceptor Activity -->
        <activity
            android:name=".ShareActivity"
            android:exported="true"
            android:label="Add to Website Vault"
            android:theme="@android:style/Theme.Translucent.NoTitleBar">

            <!-- Official Android Sharesheet Intent Filter -->
            <intent-filter>
                <action android:name="android.intent.action.SEND" />
                <category android:name="android.intent.category.DEFAULT" />
                <data android:mimeType="text/plain" />
            </intent-filter>
        </activity>

        <!-- AssetLinks verification for seamless full-screen display -->
        <meta-data
            android:name="asset_statements"
            android:resource="@string/asset_statements" />
    </application>
</manifest>
```

### C. `ShareActivity.kt` Implementation

This lightweight activity intercepts the incoming share intent, extracts `EXTRA_TEXT` and `EXTRA_SUBJECT`, builds the target Web Share URL, and opens the TWA without flickering:

```kotlin
package com.personalinvestmentos.app

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.browser.customtabs.CustomTabsIntent
import java.net.URLEncoder

class ShareActivity : Activity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        if (intent?.action == Intent.ACTION_SEND && intent.type == "text/plain") {
            handleIncomingShare(intent)
        } else {
            finish()
        }
    }

    private fun handleIncomingShare(shareIntent: Intent) {
        val sharedText = shareIntent.getStringExtra(Intent.EXTRA_TEXT) ?: ""
        val sharedTitle = shareIntent.getStringExtra(Intent.EXTRA_SUBJECT) ?: ""

        val baseUrl = "https://YOUR_INVESTMENT_OS_DOMAIN/index.html"
        val queryParams = StringBuilder("?share_target=1")

        if (sharedText.isNotBlank()) {
            queryParams.append("&text=").append(URLEncoder.encode(sharedText, "UTF-8"))
        }
        if (sharedTitle.isNotBlank()) {
            queryParams.append("&title=").append(URLEncoder.encode(sharedTitle, "UTF-8"))
        }

        val targetUri = Uri.parse(baseUrl + queryParams.toString())

        // Launch in Trusted Web Activity / Custom Tabs session
        val customTabsIntent = CustomTabsIntent.Builder()
            .setShowTitle(false)
            .build()

        customTabsIntent.launchUrl(this, targetUri)
        finish()
    }
}
```

---

## 3. Option B: Native WebView Alternative

If building an independent standalone APK without external browser dependencies:

### A. `MainActivity.kt` with Share Receiver & `onNewIntent`

```kotlin
package com.personalinvestmentos.app

import android.annotation.SuppressLint
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity
import java.net.URLEncoder

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private val BASE_URL = "https://YOUR_INVESTMENT_OS_DOMAIN/index.html"

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
            userAgentString = userAgentString + " InvestmentOS-AndroidApp/1.0"
        }

        webView.webViewClient = WebViewClient()

        if (intent?.action == Intent.ACTION_SEND) {
            handleSendIntent(intent)
        } else {
            webView.loadUrl(BASE_URL)
        }
    }

    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        setIntent(intent)
        if (intent?.action == Intent.ACTION_SEND) {
            handleSendIntent(intent)
        }
    }

    private fun handleSendIntent(sendIntent: Intent) {
        val sharedText = sendIntent.getStringExtra(Intent.EXTRA_TEXT) ?: ""
        val sharedTitle = sendIntent.getStringExtra(Intent.EXTRA_SUBJECT) ?: ""

        val query = StringBuilder("?share_target=1")
        if (sharedText.isNotBlank()) {
            query.append("&text=").append(URLEncoder.encode(sharedText, "UTF-8"))
        }
        if (sharedTitle.isNotBlank()) {
            query.append("&title=").append(URLEncoder.encode(sharedTitle, "UTF-8"))
        }

        webView.loadUrl(BASE_URL + query.toString())
    }
}
```

---

## 4. Digital Asset Links (`assetlinks.json`)

To remove the browser address bar in TWA builds, associate your Android package with your domain by placing the statement file on your web host at:

`https://YOUR_INVESTMENT_OS_DOMAIN/.well-known/assetlinks.json`

```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "com.personalinvestmentos.app",
    "sha256_cert_fingerprints": [
      "YOUR_RELEASE_KEYSTORE_SHA256_FINGERPRINT_HEX"
    ]
  }
}]
```

---

## 5. Testing with Android Debug Bridge (`adb`)

You can test the entire Share Target flow immediately on an emulator or connected device via `adb`:

### A. Test Sharing a Financial Portal URL (Cold Launch)
```bash
adb shell am start \
  -a android.intent.action.SEND \
  -t "text/plain" \
  --es android.intent.extra.TEXT "https://netbanking.hdfcbank.com" \
  --es android.intent.extra.SUBJECT "HDFC Bank NetBanking" \
  com.personalinvestmentos.app
```

### B. Test Freeform Text Snippet Containing URL (e.g., from Social / Chat App)
```bash
adb shell am start \
  -a android.intent.action.SEND \
  -t "text/plain" \
  --es android.intent.extra.TEXT "Take a look at Zerodha Kite: https://kite.zerodha.com for equity orders" \
  com.personalinvestmentos.app
```

### Expected Behavior:
1. Investment OS launches directly.
2. The `shareTarget.js` engine extracts `https://kite.zerodha.com`.
3. Auto-detect assigns category **Stocks & Mutual Funds**.
4. A crisp toast confirms: `✓ Saved to Website Vault: Zerodha Kite`.
5. The view navigates directly to `#vault` and smooth-scrolls to the new card with a 2.5s emerald cyan border highlight (`.vault-item-just-added`).
