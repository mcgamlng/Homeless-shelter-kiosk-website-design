package org.listeninghouse.checkin;

import android.app.Activity;
import android.app.DownloadManager;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.CookieManager;
import android.webkit.URLUtil;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceResponse;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

public class MainActivity extends Activity {
    private static final String PREFS_NAME = "listening_house_checkin";
    private static final String KEY_SERVER_BASE_URL = "server_base_url";
    private static final String ACTION_SCHEME = "lhcheckin";

    private WebView webView;
    private String serverBaseUrl;
    private boolean connectionHelpVisible;
    private ConnectivityManager connectivityManager;
    private ConnectivityManager.NetworkCallback networkCallback;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        serverBaseUrl = loadServerBaseUrl();

        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(139, 201, 194));
        webView.setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);

        webView.setWebChromeClient(new WebChromeClient());
        webView.addJavascriptInterface(new AppBridge(), "LHCheckIn");
        webView.setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) -> {
            DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
            String cookies = CookieManager.getInstance().getCookie(url);
            if (cookies != null) {
                request.addRequestHeader("Cookie", cookies);
            }
            request.addRequestHeader("User-Agent", userAgent);
            request.setMimeType(mimeType);
            request.setTitle(URLUtil.guessFileName(url, contentDisposition, mimeType));
            request.setDescription("Downloading Listening House spreadsheet");
            request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            request.setDestinationInExternalPublicDir(
                Environment.DIRECTORY_DOWNLOADS,
                URLUtil.guessFileName(url, contentDisposition, mimeType)
            );

            DownloadManager manager = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
            manager.enqueue(request);
            Toast.makeText(this, "Excel download started", Toast.LENGTH_LONG).show();
        });
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                Uri uri = Uri.parse(url);
                if (ACTION_SCHEME.equals(uri.getScheme())) {
                    handleAppAction(uri);
                    return true;
                }
                return false;
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (ACTION_SCHEME.equals(uri.getScheme())) {
                    handleAppAction(uri);
                    return true;
                }
                return false;
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) {
                    showConnectionHelp(error.getDescription().toString());
                }
            }

            @Override
            public void onReceivedHttpError(
                WebView view,
                WebResourceRequest request,
                WebResourceResponse errorResponse
            ) {
                if (request.isForMainFrame()) {
                    showConnectionHelp("The server answered, but the app could not open the dashboard.");
                }
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                if (serverBaseUrl != null && url != null && url.startsWith(serverBaseUrl)) {
                    connectionHelpVisible = false;
                }
            }
        });
        registerNetworkReconnect();

        Uri launchUri = getIntent() == null ? null : getIntent().getData();
        if (launchUri != null && ACTION_SCHEME.equals(launchUri.getScheme())) {
            handleAppAction(launchUri);
            return;
        }

        if (serverBaseUrl == null) {
            showConnectionHelp(
                "Choose the server address from the website's Network & Phone Access section."
            );
        } else {
            loadDashboard();
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
            return;
        }
        super.onBackPressed();
    }

    @Override
    protected void onNewIntent(android.content.Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        Uri uri = intent == null ? null : intent.getData();
        if (uri != null && ACTION_SCHEME.equals(uri.getScheme())) {
            handleAppAction(uri);
        }
    }

    @Override
    protected void onDestroy() {
        if (connectivityManager != null && networkCallback != null) {
            try {
                connectivityManager.unregisterNetworkCallback(networkCallback);
            } catch (IllegalArgumentException ignored) {
                // The callback may already be unregistered while Android is closing the app.
            }
        }
        if (webView != null) {
            webView.destroy();
        }
        super.onDestroy();
    }

    private String loadServerBaseUrl() {
        SharedPreferences preferences = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        String savedUrl = preferences.getString(KEY_SERVER_BASE_URL, null);
        String normalizedSavedUrl = normalizeServerBaseUrl(savedUrl);
        if (normalizedSavedUrl != null) {
            return normalizedSavedUrl;
        }

        return getDefaultServerBaseUrl();
    }

    private String getDefaultServerBaseUrl() {
        String configuredUrl = normalizeServerBaseUrl(getString(R.string.server_base_url));
        if (configuredUrl != null) {
            return configuredUrl;
        }

        return normalizeServerBaseUrl(getString(R.string.dashboard_url));
    }

    private String getDashboardUrl() {
        return serverBaseUrl == null ? "" : serverBaseUrl + "/dashboard";
    }

    private String getKioskUrl() {
        return serverBaseUrl == null ? "" : serverBaseUrl + "/kiosk";
    }

    private void loadDashboard() {
        if (serverBaseUrl == null) {
            showConnectionHelp("Choose a server address before retrying.");
            return;
        }
        runOnUiThread(() -> {
            webView.stopLoading();
            webView.loadUrl(getDashboardUrl() + "?androidReconnect=" + System.currentTimeMillis());
        });
    }

    private void loadKiosk() {
        if (serverBaseUrl == null) {
            showConnectionHelp("Choose a server address before opening the kiosk.");
            return;
        }
        runOnUiThread(() -> {
            webView.stopLoading();
            webView.loadUrl(getKioskUrl());
        });
    }

    private void saveServerBaseUrl(String rawUrl) {
        String normalizedUrl = normalizeServerBaseUrl(rawUrl);
        if (normalizedUrl == null) {
            runOnUiThread(() -> {
                Toast.makeText(this, "Enter a valid server address", Toast.LENGTH_LONG).show();
                showConnectionHelp("That server address was not valid.");
            });
            return;
        }

        serverBaseUrl = normalizedUrl;
        getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
            .edit()
            .putString(KEY_SERVER_BASE_URL, serverBaseUrl)
            .apply();
        runOnUiThread(() -> Toast.makeText(this, "Server address saved", Toast.LENGTH_LONG).show());
        loadDashboard();
    }

    private String normalizeServerBaseUrl(String rawUrl) {
        if (rawUrl == null) {
            return null;
        }

        String value = rawUrl.trim();
        if (value.length() == 0) {
            return null;
        }

        if (!value.startsWith("http://") && !value.startsWith("https://")) {
            value = "http://" + value;
        }

        Uri parsed = Uri.parse(value);
        String scheme = parsed.getScheme();
        String host = parsed.getHost();
        if (scheme == null || host == null) {
            return null;
        }

        if (!"http".equals(scheme) && !"https".equals(scheme)) {
            return null;
        }

        StringBuilder baseUrl = new StringBuilder();
        baseUrl.append(scheme).append("://").append(host);
        if (parsed.getPort() > 0) {
            baseUrl.append(":").append(parsed.getPort());
        }

        return baseUrl.toString();
    }

    private void handleAppAction(Uri uri) {
        String host = uri.getHost();
        if ("retry".equals(host) || "dashboard".equals(host)) {
            loadDashboard();
            return;
        }

        if ("kiosk".equals(host)) {
            loadKiosk();
            return;
        }

        if ("save".equals(host)) {
            saveServerBaseUrl(uri.getQueryParameter("url"));
            return;
        }

        if ("reset".equals(host)) {
            serverBaseUrl = getDefaultServerBaseUrl();
            getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
                .edit()
                .remove(KEY_SERVER_BASE_URL)
                .apply();
            Toast.makeText(this, "Server address reset", Toast.LENGTH_LONG).show();
            if (serverBaseUrl == null) {
                showConnectionHelp("The saved server address was cleared.");
            } else {
                loadDashboard();
            }
            return;
        }

        showConnectionHelp(null);
    }

    private String escapeHtml(String value) {
        if (value == null) {
            return "";
        }

        return value
            .replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace("\"", "&quot;")
            .replace("'", "&#39;");
    }

    private void showConnectionHelp(String errorMessage) {
        connectionHelpVisible = true;
        String dashboardUrl = getDashboardUrl();
        String kioskUrl = getKioskUrl();
        String safeError = errorMessage == null ? "" : escapeHtml(errorMessage);
        String safeServerBaseUrl = escapeHtml(serverBaseUrl);
        String safeDashboardUrl = escapeHtml(dashboardUrl);
        String safeKioskUrl = escapeHtml(kioskUrl);
        String html = "<!doctype html><html><head><meta name='viewport' content='width=device-width, initial-scale=1' />"
            + "<style>"
            + "*{box-sizing:border-box}body{margin:0;min-height:100vh;background:#8BC9C2;color:#202020;font-family:system-ui,-apple-system,Segoe UI,sans-serif;display:flex;align-items:center;justify-content:center;padding:18px;}"
            + "main{width:min(620px,100%);background:#F7F7F2;border:3px solid #22356D;padding:24px;box-shadow:10px 10px 0 rgba(34,53,109,.25);}"
            + "h1{margin:0 0 10px;color:#22356D;font-size:28px;line-height:1.1}p{font-size:17px;line-height:1.42;margin:12px 0}.small{font-size:14px;color:#4d4d4d}.url{overflow-wrap:anywhere;font-weight:900;color:#22356D}"
            + "a,button{display:block;width:100%;margin-top:12px;padding:16px 18px;border:0;background:#22356D;color:white;text-align:center;text-decoration:none;font-weight:900;border-radius:999px;font-size:17px;}"
            + ".secondary{background:#9B6BAA}.light{background:#E8F4F1;color:#22356D;border:2px solid #22356D}.danger{background:#C96A4A}"
            + "label{display:block;margin-top:18px;font-size:15px;font-weight:900;color:#22356D}input{width:100%;font-size:17px;padding:14px;margin-top:8px;border:2px solid #22356D;background:white;color:#202020}"
            + ".notice{background:#E8F4F1;border-left:6px solid #22356D;padding:12px 14px;margin-top:14px}.error{background:#F7E2D8;border-left-color:#C96A4A}"
            + "</style></head><body><main>"
            + "<h1>Listening House Check-In</h1>"
            + "<p>The phone app could not reach the guest check-in system. A local address works when the phone and server use the same Wi-Fi. A public HTTPS address works from any internet connection.</p>"
            + "<div class='notice'><p class='small'>Current server address</p><p class='url'>" + safeServerBaseUrl + "</p></div>"
            + (safeError.length() > 0 ? "<div class='notice error'><p class='small'>Connection message</p><p>" + safeError + "</p></div>" : "")
            + "<button type='button' onclick='retryApp()'>Try again</button>"
            + "<button class='light' type='button' onclick='openWifiSettings()'>Open Wi-Fi settings</button>"
            + "<button class='secondary' type='button' onclick='openKiosk()'>Open kiosk instead</button>"
            + "<form onsubmit='saveServer();return false;'>"
            + "<label for='server'>Change laptop or Raspberry Pi address</label>"
            + "<input id='server' value='" + safeServerBaseUrl + "' placeholder='http://192.168.1.42:3000' autocomplete='off' autocapitalize='none' spellcheck='false' />"
            + "<button type='submit'>Save address and reconnect</button>"
            + "</form>"
            + "<button class='light' type='button' onclick='retryApp()'>Open dashboard: " + safeDashboardUrl + "</button>"
            + "<button class='light' type='button' onclick='openKiosk()'>Open kiosk: " + safeKioskUrl + "</button>"
            + "<button class='danger' type='button' onclick='resetServer()'>Reset to default address</button>"
            + "<p class='small'>In Admin, open <strong>Network &amp; Phone Access</strong>, save the correct address, then press <strong>Connect installed Android app</strong>. Do not use localhost on the phone.</p>"
            + "<script>"
            + "function useLink(path){location.href='lhcheckin://'+path;}"
            + "function retryApp(){if(window.LHCheckIn){window.LHCheckIn.retry();}else{useLink('retry');}}"
            + "function openKiosk(){if(window.LHCheckIn){window.LHCheckIn.openKiosk();}else{useLink('kiosk');}}"
            + "function openWifiSettings(){if(window.LHCheckIn){window.LHCheckIn.openWifiSettings();}}"
            + "function resetServer(){if(window.LHCheckIn){window.LHCheckIn.resetServer();}else{useLink('reset');}}"
            + "function saveServer(){var value=document.getElementById('server').value;if(window.LHCheckIn){window.LHCheckIn.saveServer(value);}else{location.href='lhcheckin://save?url='+encodeURIComponent(value);}}"
            + "</script>"
            + "</main></body></html>";
        String helpBaseUrl = dashboardUrl.length() > 0 ? dashboardUrl : "https://localhost.invalid/";
        runOnUiThread(() -> webView.loadDataWithBaseURL(helpBaseUrl, html, "text/html", "UTF-8", null));
    }

    private void registerNetworkReconnect() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) {
            return;
        }
        connectivityManager = (ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
        if (connectivityManager == null) {
            return;
        }
        networkCallback = new ConnectivityManager.NetworkCallback() {
            @Override
            public void onAvailable(Network network) {
                if (!connectionHelpVisible || serverBaseUrl == null) {
                    return;
                }
                new Handler(Looper.getMainLooper()).postDelayed(
                    MainActivity.this::loadDashboard,
                    900
                );
            }
        };
        connectivityManager.registerDefaultNetworkCallback(networkCallback);
    }

    private void openWifiSettings() {
        runOnUiThread(() -> {
            Intent intent = new Intent(Settings.ACTION_WIFI_SETTINGS);
            startActivity(intent);
        });
    }

    private final class AppBridge {
        @JavascriptInterface
        public void retry() {
            loadDashboard();
        }

        @JavascriptInterface
        public void openKiosk() {
            loadKiosk();
        }

        @JavascriptInterface
        public void saveServer(String rawUrl) {
            saveServerBaseUrl(rawUrl);
        }

        @JavascriptInterface
        public void resetServer() {
            serverBaseUrl = getDefaultServerBaseUrl();
            getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
                .edit()
                .remove(KEY_SERVER_BASE_URL)
                .apply();
            runOnUiThread(() -> Toast.makeText(MainActivity.this, "Server address reset", Toast.LENGTH_LONG).show());
            if (serverBaseUrl == null) {
                showConnectionHelp("The saved server address was cleared.");
            } else {
                loadDashboard();
            }
        }

        @JavascriptInterface
        public void openWifiSettings() {
            MainActivity.this.openWifiSettings();
        }
    }
}
