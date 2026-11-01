package com.empirestreets.game

import android.annotation.SuppressLint
import android.content.Context
import android.os.Bundle
import android.os.PowerManager
import android.view.View
import android.view.WindowManager
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.webkit.WebViewAssetLoader

/**
 * Empire Streets for Android: the built web game (dist/, copied to assets/www by
 * scripts/android-sync.sh) in a full-screen WebView. The files are served from
 * https://appassets.androidplatform.net/assets/www/ by WebViewAssetLoader, which is a secure
 * origin, so ES modules, fetch, WebGL 2, Web Audio and local storage all work exactly as in a
 * browser. The game detects the app from the user agent ("EmpireStreets") and shows its touch
 * controls. The back button pauses the game.
 */
class MainActivity : AppCompatActivity() {
    private lateinit var web: WebView

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        hideBars()
        // Steady clocks over a long session rather than a burst then thermal throttling.
        val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
        if (pm.isSustainedPerformanceModeSupported) window.setSustainedPerformanceMode(true)

        web = WebView(this)
        setContentView(web)
        val s = web.settings
        s.javaScriptEnabled = true
        s.domStorageEnabled = true
        s.mediaPlaybackRequiresUserGesture = false
        s.allowFileAccess = false
        s.allowContentAccess = false
        s.useWideViewPort = true
        s.loadWithOverviewMode = true
        s.setSupportZoom(false)
        s.userAgentString = s.userAgentString + " EmpireStreets/1.0"
        web.setBackgroundColor(0xFF0B0D12.toInt())
        web.setLayerType(View.LAYER_TYPE_HARDWARE, null)

        val loader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()
        web.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                loader.shouldInterceptRequest(request.url)
        }
        if (savedInstanceState == null) web.loadUrl("https://appassets.androidplatform.net/assets/www/index.html")
        else web.restoreState(savedInstanceState)
    }

    private fun hideBars() {
        WindowInsetsControllerCompat(window, window.decorView).let {
            it.hide(WindowInsetsCompat.Type.systemBars())
            it.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        }
    }

    // Back to full screen after a notification shade or a dialog.
    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) hideBars()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        web.saveState(outState)
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        // Back pauses the game (or resumes it) rather than leaving the app.
        web.evaluateJavascript("(function(){var g=window.game;if(!g)return false;if(g.state==='playing'){g.pause();return true;}if(g.state==='paused'){g.resume();return true;}return false;})()") { }
    }

    override fun onPause() {
        super.onPause()
        web.evaluateJavascript("(function(){var g=window.game;if(g&&g.state==='playing')g.pause();})()", null)
        web.onPause()
    }

    override fun onResume() {
        super.onResume()
        web.onResume()
    }
}
