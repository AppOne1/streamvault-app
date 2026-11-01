package ir.appone.onedownload;

import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import androidx.core.content.FileProvider;
import com.getcapacitor.BridgeActivity;
import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.URL;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends BridgeActivity {

    private static volatile int localProxyPort = 0;
    private static ServerSocket localProxyServer = null;
    private static final ExecutorService proxyExecutor = Executors.newCachedThreadPool();

    private static final String DESKTOP_UA =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
    private static final String MOBILE_SAFARI_UA =
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        startLocalStreamProxyIfNeeded();
        super.onCreate(savedInstanceState);
        // Lock main app UI in Portrait so it never rotates when phone rotation lock is enabled
        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
        if (this.bridge != null && this.bridge.getWebView() != null) {
            this.bridge.getWebView().addJavascriptInterface(new OneDownloadNativeBridge(), "OneDownloadNative");
        }
    }

    private static synchronized void startLocalStreamProxyIfNeeded() {
        if (localProxyPort > 0 && localProxyServer != null && !localProxyServer.isClosed()) {
            return;
        }
        try {
            localProxyServer = new ServerSocket(0, 64, InetAddress.getByName("127.0.0.1"));
            localProxyPort = localProxyServer.getLocalPort();
            Thread acceptThread = new Thread(() -> {
                while (localProxyServer != null && !localProxyServer.isClosed()) {
                    try {
                        final Socket client = localProxyServer.accept();
                        proxyExecutor.execute(() -> handleProxyClient(client));
                    } catch (Exception ignored) {
                        break;
                    }
                }
            }, "OneDownloadLocalProxy");
            acceptThread.setDaemon(true);
            acceptThread.start();
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    private static void handleProxyClient(Socket client) {
        HttpURLConnection upstreamConn = null;
        try {
            client.setSoTimeout(60000);
            InputStream clientIn = client.getInputStream();
            OutputStream clientOut = client.getOutputStream();
            BufferedReader reader = new BufferedReader(new InputStreamReader(clientIn, StandardCharsets.UTF_8));

            String requestLine = reader.readLine();
            if (requestLine == null || requestLine.isEmpty()) {
                client.close();
                return;
            }

            String[] parts = requestLine.split(" ");
            String method = parts.length > 0 ? parts[0].toUpperCase(Locale.ROOT) : "GET";
            String rawPath = parts.length > 1 ? parts[1] : "/";

            String reqRangeHeader = null;
            String headerLine;
            while ((headerLine = reader.readLine()) != null && !headerLine.isEmpty()) {
                int colon = headerLine.indexOf(':');
                if (colon > 0) {
                    String hName = headerLine.substring(0, colon).trim().toLowerCase(Locale.ROOT);
                    String hVal = headerLine.substring(colon + 1).trim();
                    if ("range".equals(hName)) {
                        reqRangeHeader = hVal;
                    }
                }
            }

            if ("OPTIONS".equals(method)) {
                String corsResp =
                    "HTTP/1.1 204 No Content\r\n" +
                    "Access-Control-Allow-Origin: *\r\n" +
                    "Access-Control-Allow-Methods: GET, HEAD, OPTIONS\r\n" +
                    "Access-Control-Allow-Headers: Range, Content-Type, Accept, Origin\r\n" +
                    "Access-Control-Expose-Headers: Content-Length, Content-Range, Accept-Ranges, Content-Type\r\n" +
                    "Connection: close\r\n\r\n";
                clientOut.write(corsResp.getBytes(StandardCharsets.UTF_8));
                clientOut.flush();
                client.close();
                return;
            }

            String targetUrl = null;
            String queryRange = null;
            int qIdx = rawPath.indexOf('?');
            if (qIdx >= 0 && qIdx + 1 < rawPath.length()) {
                String query = rawPath.substring(qIdx + 1);
                String[] params = query.split("&");
                for (String p : params) {
                    int eq = p.indexOf('=');
                    if (eq > 0) {
                        String k = p.substring(0, eq);
                        String v = URLDecoder.decode(p.substring(eq + 1), "UTF-8");
                        if ("url".equals(k)) {
                            targetUrl = v;
                        } else if ("range".equals(k)) {
                            queryRange = v;
                        }
                    }
                }
            }

            if (targetUrl == null || (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://"))) {
                String badResp =
                    "HTTP/1.1 400 Bad Request\r\n" +
                    "Access-Control-Allow-Origin: *\r\n" +
                    "Content-Length: 0\r\n" +
                    "Connection: close\r\n\r\n";
                clientOut.write(badResp.getBytes(StandardCharsets.UTF_8));
                clientOut.flush();
                client.close();
                return;
            }

            String effectiveRange = reqRangeHeader != null ? reqRangeHeader : queryRange;
            if (effectiveRange != null && !effectiveRange.isEmpty() && !effectiveRange.startsWith("bytes=")) {
                effectiveRange = "bytes=" + effectiveRange;
            }

            String currentUrl = targetUrl;
            int status = 500;
            for (int redirectCount = 0; redirectCount < 6; redirectCount++) {
                URL u = new URL(currentUrl);
                upstreamConn = (HttpURLConnection) u.openConnection();
                upstreamConn.setInstanceFollowRedirects(false);
                upstreamConn.setConnectTimeout(25000);
                upstreamConn.setReadTimeout(90000);
                upstreamConn.setRequestMethod("HEAD".equals(method) ? "HEAD" : "GET");

                String lowerUrl = currentUrl.toLowerCase(Locale.ROOT);
                boolean isIg = lowerUrl.contains("instagram") || lowerUrl.contains("cdninstagram");
                upstreamConn.setRequestProperty("User-Agent", isIg ? MOBILE_SAFARI_UA : DESKTOP_UA);
                upstreamConn.setRequestProperty("Accept", "*/*");
                upstreamConn.setRequestProperty("Accept-Encoding", "identity");

                if (lowerUrl.contains("savevideo.uz")) {
                    upstreamConn.setRequestProperty("Referer", "https://savevideo.uz/");
                } else if (isIg) {
                    upstreamConn.setRequestProperty("Referer", "https://www.instagram.com/");
                } else if (lowerUrl.contains("tikwm.com")) {
                    upstreamConn.setRequestProperty("Referer", "https://www.tikwm.com/");
                } else if (lowerUrl.contains("tiktok")) {
                    upstreamConn.setRequestProperty("Referer", "https://www.tiktok.com/");
                } else if (lowerUrl.contains("googlevideo.com") || lowerUrl.contains("youtube.com")) {
                    upstreamConn.setRequestProperty("Referer", "https://www.youtube.com/");
                } else if (lowerUrl.contains("twimg.com") || lowerUrl.contains("twitter.com") || lowerUrl.contains("x.com")) {
                    upstreamConn.setRequestProperty("Referer", "https://x.com/");
                }

                if (effectiveRange != null && !effectiveRange.isEmpty()) {
                    upstreamConn.setRequestProperty("Range", effectiveRange);
                }

                status = upstreamConn.getResponseCode();
                if (status == HttpURLConnection.HTTP_MOVED_TEMP ||
                    status == HttpURLConnection.HTTP_MOVED_PERM ||
                    status == HttpURLConnection.HTTP_SEE_OTHER ||
                    status == 307 ||
                    status == 308) {
                    String loc = upstreamConn.getHeaderField("Location");
                    upstreamConn.disconnect();
                    if (loc != null && !loc.isEmpty()) {
                        currentUrl = new URL(u, loc).toString();
                        continue;
                    }
                }
                break;
            }

            if (upstreamConn == null) {
                client.close();
                return;
            }

            String contentType = upstreamConn.getContentType();
            if (contentType == null || contentType.isEmpty() || contentType.contains("text/plain")) {
                contentType = "video/mp4";
            }
            long contentLength = upstreamConn.getContentLengthLong();
            String contentRange = upstreamConn.getHeaderField("Content-Range");

            String statusText = status == 206 ? "206 Partial Content" : (status >= 200 && status < 300 ? "200 OK" : status + " Error");
            StringBuilder respHeaders = new StringBuilder();
            respHeaders.append("HTTP/1.1 ").append(statusText).append("\r\n");
            respHeaders.append("Access-Control-Allow-Origin: *\r\n");
            respHeaders.append("Access-Control-Allow-Methods: GET, HEAD, OPTIONS\r\n");
            respHeaders.append("Access-Control-Allow-Headers: *\r\n");
            respHeaders.append("Access-Control-Expose-Headers: Content-Length, Content-Range, Accept-Ranges, Content-Type\r\n");
            respHeaders.append("Accept-Ranges: bytes\r\n");
            respHeaders.append("Cache-Control: no-store, no-transform\r\n");
            respHeaders.append("Content-Type: ").append(contentType).append("\r\n");
            if (contentLength >= 0) {
                respHeaders.append("Content-Length: ").append(contentLength).append("\r\n");
            }
            if (contentRange != null && !contentRange.isEmpty()) {
                respHeaders.append("Content-Range: ").append(contentRange).append("\r\n");
            }
            respHeaders.append("Connection: close\r\n\r\n");

            clientOut.write(respHeaders.toString().getBytes(StandardCharsets.UTF_8));
            clientOut.flush();

            if (!"HEAD".equals(method) && status >= 200 && status < 300) {
                try (InputStream upIn = upstreamConn.getInputStream()) {
                    byte[] buf = new byte[65536];
                    int read;
                    while ((read = upIn.read(buf)) != -1) {
                        clientOut.write(buf, 0, read);
                    }
                    clientOut.flush();
                }
            }
        } catch (Exception ignored) {
            // Client aborted or stream ended
        } finally {
            if (upstreamConn != null) {
                try {
                    upstreamConn.disconnect();
                } catch (Exception ignored) {}
            }
            try {
                client.close();
            } catch (Exception ignored) {}
        }
    }

    public class OneDownloadNativeBridge {

        @JavascriptInterface
        public String getLocalProxyUrl() {
            startLocalStreamProxyIfNeeded();
            return localProxyPort > 0 ? "http://127.0.0.1:" + localProxyPort : "";
        }

        @JavascriptInterface
        public void setScreenOrientation(final String mode) {
            runOnUiThread(() -> {
                try {
                    if ("landscape".equalsIgnoreCase(mode)) {
                        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
                    } else if ("user".equalsIgnoreCase(mode)) {
                        // SCREEN_ORIENTATION_USER strictly obeys the phone's system Auto-Rotate lock
                        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_USER);
                    } else {
                        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
                    }
                } catch (Exception ignored) {}
            });
        }

        @JavascriptInterface
        public boolean shareInstalledApk(final String referralMessage) {
            return shareInstalledApkToTarget(referralMessage, null);
        }

        @JavascriptInterface
        public boolean shareInstalledApkToTarget(final String referralMessage, final String targetPackage) {
            try {
                String sourceApkPath = getApplicationInfo().sourceDir;
                File sourceApk = new File(sourceApkPath);
                if (!sourceApk.exists()) {
                    return false;
                }

                // Copy the installed APK into cache as OneDownload.apk for direct file sending
                File cleanApkFile = new File(getCacheDir(), "OneDownload.apk");
                if (!cleanApkFile.exists() || cleanApkFile.length() != sourceApk.length()) {
                    try (InputStream in = new FileInputStream(sourceApk);
                         OutputStream out = new FileOutputStream(cleanApkFile)) {
                        byte[] buf = new byte[65536];
                        int len;
                        while ((len = in.read(buf)) > 0) {
                            out.write(buf, 0, len);
                        }
                        out.flush();
                    }
                }

                final Uri apkUri = FileProvider.getUriForFile(
                    MainActivity.this,
                    getPackageName() + ".fileprovider",
                    cleanApkFile
                );

                runOnUiThread(() -> {
                    try {
                        // Also copy caption to clipboard as backup for Bluetooth/strict targets
                        if (referralMessage != null && !referralMessage.isEmpty()) {
                            ClipboardManager clipboard = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
                            if (clipboard != null) {
                                clipboard.setPrimaryClip(ClipData.newPlainText("OneDownload Invite", referralMessage));
                            }
                        }

                        Intent shareIntent = new Intent(Intent.ACTION_SEND);
                        shareIntent.setType("application/vnd.android.package-archive");
                        shareIntent.putExtra(Intent.EXTRA_STREAM, apkUri);
                        if (referralMessage != null && !referralMessage.isEmpty()) {
                            shareIntent.putExtra(Intent.EXTRA_TEXT, referralMessage);
                            shareIntent.putExtra(Intent.EXTRA_TITLE, referralMessage);
                            shareIntent.putExtra(Intent.EXTRA_SUBJECT, "وان دانلود (OneDownload)");
                        }

                        // Required on Android 10+ so target apps (Telegram, Eitaa, WhatsApp, Rubika) can read the APK URI
                        ClipData clipData = ClipData.newRawUri("OneDownload.apk", apkUri);
                        shareIntent.setClipData(clipData);
                        shareIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

                        if (targetPackage != null && !targetPackage.isEmpty() && isPackageInstalled(targetPackage)) {
                            shareIntent.setPackage(targetPackage);
                            shareIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                            startActivity(shareIntent);
                        } else {
                            Intent chooser = Intent.createChooser(shareIntent, "ارسال فایل APK وان دانلود به همراه کد معرف");
                            chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
                            startActivity(chooser);
                        }
                    } catch (Exception uiErr) {
                        uiErr.printStackTrace();
                    }
                });

                return true;
            } catch (Exception e) {
                e.printStackTrace();
                return false;
            }
        }

        private boolean isPackageInstalled(String packageName) {
            try {
                PackageManager pm = getPackageManager();
                pm.getPackageInfo(packageName, 0);
                return true;
            } catch (Exception e) {
                return false;
            }
        }
    }
}
