package ir.appone.onedownload;

import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageManager;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.net.wifi.WifiManager;
import android.os.Bundle;
import android.os.Environment;
import android.os.PowerManager;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import androidx.core.content.FileProvider;
import com.getcapacitor.BridgeActivity;
import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.io.RandomAccessFile;
import java.net.HttpURLConnection;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.URL;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class MainActivity extends BridgeActivity {

    private static volatile int localProxyPort = 0;
    private static ServerSocket localProxyServer = null;
    private static final ExecutorService proxyExecutor = Executors.newCachedThreadPool();
    private static volatile File appCacheDir = null;
    private static volatile boolean backgroundDownloadActive = false;
    private PowerManager.WakeLock cpuWakeLock = null;
    private WifiManager.WifiLock wifiLock = null;

    private static final Pattern SAVEVIDEO_TASK_PATTERN =
        Pattern.compile("savevideo\\.uz/api/(file|audio)/([A-Za-z0-9_-]+)");

    private static class NativeSpoolEntry {
        final File file;
        volatile long totalSize = 0;
        volatile long writtenBytes = 0;
        volatile boolean done = false;
        volatile boolean error = false;
        volatile String contentType = "video/mp4";
        final Object lock = new Object();

        NativeSpoolEntry(File file) {
            this.file = file;
        }
    }

    private static final Map<String, NativeSpoolEntry> svNativeSpoolMap = new ConcurrentHashMap<>();

    private static final String DESKTOP_UA =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
    private static final String MOBILE_SAFARI_UA =
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        appCacheDir = getCacheDir();
        startLocalStreamProxyIfNeeded();
        super.onCreate(savedInstanceState);
        // Lock main app UI in Portrait so it never rotates when phone rotation lock is enabled
        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
        if (this.bridge != null && this.bridge.getWebView() != null) {
            this.bridge.getWebView().addJavascriptInterface(new OneDownloadNativeBridge(), "OneDownloadNative");
        }
    }

    @Override
    public void onPause() {
        super.onPause();
        // Keep WebView timers and active downloads running when user switches apps or locks screen
        keepWebViewAliveInBackground();
    }

    @Override
    public void onStop() {
        super.onStop();
        keepWebViewAliveInBackground();
    }

    private void keepWebViewAliveInBackground() {
        if (!backgroundDownloadActive) return;
        runOnUiThread(() -> {
            try {
                if (this.bridge != null && this.bridge.getWebView() != null) {
                    WebView wv = this.bridge.getWebView();
                    wv.onResume();
                    wv.resumeTimers();
                }
            } catch (Exception ignored) {}
        });
    }

    private synchronized void updateBackgroundLocks(boolean active) {
        backgroundDownloadActive = active;
        try {
            if (active) {
                if (cpuWakeLock == null) {
                    PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
                    if (pm != null) {
                        cpuWakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "OneDownload::BgDownloadWakeLock");
                        cpuWakeLock.setReferenceCounted(false);
                    }
                }
                if (cpuWakeLock != null && !cpuWakeLock.isHeld()) {
                    cpuWakeLock.acquire(30 * 60 * 1000L);
                }
                if (wifiLock == null) {
                    WifiManager wm = (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
                    if (wm != null) {
                        wifiLock = wm.createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "OneDownload::BgWifiLock");
                        wifiLock.setReferenceCounted(false);
                    }
                }
                if (wifiLock != null && !wifiLock.isHeld()) {
                    wifiLock.acquire();
                }
                keepWebViewAliveInBackground();
            } else {
                if (cpuWakeLock != null && cpuWakeLock.isHeld()) {
                    cpuWakeLock.release();
                }
                if (wifiLock != null && wifiLock.isHeld()) {
                    wifiLock.release();
                }
            }
        } catch (Exception ignored) {}
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

    private static NativeSpoolEntry ensureNativeSaveVideoSpool(final String taskId, final String targetUrl, final boolean isAudio) {
        NativeSpoolEntry existing = svNativeSpoolMap.get(taskId);
        if (existing != null && !existing.error) {
            if (!existing.done || (existing.file.exists() && existing.writtenBytes > 65536)) {
                return existing;
            }
        }
        File dir = appCacheDir != null ? appCacheDir : new File(System.getProperty("java.io.tmpdir", "/tmp"));
        File spoolFile = new File(dir, "onedl_sv_" + taskId + (isAudio ? ".mp3" : ".mp4"));
        final NativeSpoolEntry entry = new NativeSpoolEntry(spoolFile);
        entry.contentType = isAudio ? "audio/mpeg" : "video/mp4";
        svNativeSpoolMap.put(taskId, entry);

        proxyExecutor.execute(() -> {
            HttpURLConnection conn = null;
            try {
                String currentUrl = targetUrl;
                for (int r = 0; r < 5; r++) {
                    URL u = new URL(currentUrl);
                    conn = (HttpURLConnection) u.openConnection();
                    conn.setInstanceFollowRedirects(false);
                    conn.setConnectTimeout(25000);
                    conn.setReadTimeout(90000);
                    conn.setRequestMethod("GET");
                    conn.setRequestProperty("User-Agent", DESKTOP_UA);
                    conn.setRequestProperty("Accept", "*/*");
                    conn.setRequestProperty("Accept-Encoding", "identity");
                    conn.setRequestProperty("Referer", "https://savevideo.uz/");
                    int st = conn.getResponseCode();
                    if (st == 301 || st == 302 || st == 303 || st == 307 || st == 308) {
                        String loc = conn.getHeaderField("Location");
                        conn.disconnect();
                        if (loc != null && !loc.isEmpty()) {
                            currentUrl = new URL(u, loc).toString();
                            continue;
                        }
                    }
                    break;
                }
                if (conn == null || conn.getResponseCode() >= 400) {
                    throw new Exception("Upstream SaveVideo status error");
                }
                long cl = conn.getContentLengthLong();
                if (cl > 0) {
                    entry.totalSize = cl;
                }
                String ct = conn.getContentType();
                if (ct != null && !ct.isEmpty() && !ct.contains("text/")) {
                    entry.contentType = ct;
                }
                synchronized (entry.lock) {
                    entry.lock.notifyAll();
                }

                try (InputStream in = conn.getInputStream();
                     FileOutputStream fos = new FileOutputStream(spoolFile, false)) {
                    byte[] buf = new byte[65536];
                    int read;
                    while ((read = in.read(buf)) != -1) {
                        fos.write(buf, 0, read);
                        entry.writtenBytes += read;
                        if (entry.totalSize > 0 && entry.writtenBytes > entry.totalSize) {
                            entry.totalSize = entry.writtenBytes;
                        }
                        synchronized (entry.lock) {
                            entry.lock.notifyAll();
                        }
                    }
                    fos.flush();
                }

                if (entry.writtenBytes < (isAudio ? 32768 : 120000)) {
                    throw new Exception("Spooled file too small");
                }
                entry.totalSize = entry.writtenBytes;
                entry.done = true;
                synchronized (entry.lock) {
                    entry.lock.notifyAll();
                }
            } catch (Exception e) {
                entry.error = true;
                entry.done = true;
                synchronized (entry.lock) {
                    entry.lock.notifyAll();
                }
                svNativeSpoolMap.remove(taskId);
            } finally {
                if (conn != null) {
                    try {
                        conn.disconnect();
                    } catch (Exception ignored) {}
                }
            }
        });

        return entry;
    }

    private static void serveNativeSpooledEntry(
        NativeSpoolEntry entry,
        String method,
        String effectiveRange,
        OutputStream clientOut
    ) throws Exception {
        long waitDeadline = System.currentTimeMillis() + 35000L;
        synchronized (entry.lock) {
            while (entry.writtenBytes == 0 && !entry.done && !entry.error && System.currentTimeMillis() < waitDeadline) {
                entry.lock.wait(250);
            }
        }
        if (entry.error || (entry.done && entry.writtenBytes == 0)) {
            String errResp = "HTTP/1.1 502 Bad Gateway\r\nAccess-Control-Allow-Origin: *\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
            clientOut.write(errResp.getBytes(StandardCharsets.UTF_8));
            clientOut.flush();
            return;
        }

        long start = 0;
        long requestedEnd = -1;
        boolean isRange = false;
        if (effectiveRange != null && effectiveRange.startsWith("bytes=")) {
            isRange = true;
            String spec = effectiveRange.substring(6).trim();
            int dash = spec.indexOf('-');
            if (dash >= 0) {
                String sPart = spec.substring(0, dash).trim();
                String ePart = spec.substring(dash + 1).trim();
                if (!sPart.isEmpty()) start = Long.parseLong(sPart);
                if (!ePart.isEmpty()) requestedEnd = Long.parseLong(ePart);
            }
        }

        long waitTarget = requestedEnd > start ? (requestedEnd + 1) : (start + 262144L);
        long sliceDeadline = System.currentTimeMillis() + 35000L;
        synchronized (entry.lock) {
            while (!entry.done && !entry.error && entry.writtenBytes < waitTarget && System.currentTimeMillis() < sliceDeadline) {
                entry.lock.wait(200);
            }
        }

        long knownTotal = entry.done ? entry.writtenBytes : (entry.totalSize > entry.writtenBytes ? entry.totalSize : entry.writtenBytes + 2097152L);
        long actualEnd = (requestedEnd >= start && requestedEnd < knownTotal) ? requestedEnd : (knownTotal - 1);
        long contentLen = Math.max(0L, actualEnd - start + 1L);

        StringBuilder h = new StringBuilder();
        h.append("HTTP/1.1 ").append(isRange ? "206 Partial Content" : "200 OK").append("\r\n");
        h.append("Access-Control-Allow-Origin: *\r\n");
        h.append("Access-Control-Allow-Methods: GET, HEAD, OPTIONS\r\n");
        h.append("Access-Control-Allow-Headers: *\r\n");
        h.append("Access-Control-Expose-Headers: Content-Length, Content-Range, Accept-Ranges, Content-Type\r\n");
        h.append("Accept-Ranges: bytes\r\n");
        h.append("Cache-Control: no-store, no-transform\r\n");
        h.append("Content-Type: ").append(entry.contentType).append("\r\n");
        if (contentLen > 0) {
            h.append("Content-Length: ").append(contentLen).append("\r\n");
        }
        if (isRange && knownTotal > 0) {
            h.append("Content-Range: bytes ").append(start).append("-").append(actualEnd).append("/").append(knownTotal).append("\r\n");
        }
        h.append("Connection: close\r\n\r\n");
        clientOut.write(h.toString().getBytes(StandardCharsets.UTF_8));
        clientOut.flush();

        if ("HEAD".equals(method)) return;

        try (RandomAccessFile raf = new RandomAccessFile(entry.file, "r")) {
            long pos = start;
            byte[] buf = new byte[65536];
            while (true) {
                synchronized (entry.lock) {
                    while (!entry.done && !entry.error && entry.writtenBytes <= pos) {
                        entry.lock.wait(150);
                    }
                }
                if (entry.error) break;
                long avail = entry.writtenBytes - pos;
                if (requestedEnd >= start) {
                    long rem = (requestedEnd + 1) - pos;
                    if (rem <= 0) break;
                    avail = Math.min(avail, rem);
                }
                if (avail <= 0) {
                    if (entry.done) break;
                    continue;
                }
                raf.seek(pos);
                int toRead = (int) Math.min((long) buf.length, avail);
                int r = raf.read(buf, 0, toRead);
                if (r <= 0) {
                    if (entry.done) break;
                    continue;
                }
                clientOut.write(buf, 0, r);
                pos += r;
            }
            clientOut.flush();
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

            // If targetUrl is a single-use SaveVideo file/audio stream, spool it to cacheDir once and serve with full Range support!
            Matcher svMatcher = SAVEVIDEO_TASK_PATTERN.matcher(targetUrl);
            if (svMatcher.find()) {
                boolean isSvAudio = "audio".equalsIgnoreCase(svMatcher.group(1));
                String svTaskId = svMatcher.group(2);
                NativeSpoolEntry spoolEntry = ensureNativeSaveVideoSpool(svTaskId, targetUrl, isSvAudio);
                serveNativeSpooledEntry(spoolEntry, method, effectiveRange, clientOut);
                return;
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
        public void setBackgroundDownloadActive(final boolean active) {
            updateBackgroundLocks(active);
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

        @JavascriptInterface
        public String beginChunkedMediaSave(final String fileName) {
            try {
                File targetFile = resolveDownloadTargetFile(fileName);
                File parent = targetFile.getParentFile();
                if (parent != null && !parent.exists()) {
                    parent.mkdirs();
                }
                if (targetFile.exists()) {
                    targetFile.delete();
                }
                try (FileOutputStream fos = new FileOutputStream(targetFile, false)) {
                    fos.flush();
                }
                return targetFile.getAbsolutePath();
            } catch (Exception e) {
                e.printStackTrace();
                return "";
            }
        }

        @JavascriptInterface
        public boolean appendChunkedMediaSave(final String fileName, final String base64Chunk) {
            if (base64Chunk == null || base64Chunk.isEmpty()) {
                return true;
            }
            try {
                File targetFile = resolveDownloadTargetFile(fileName);
                File parent = targetFile.getParentFile();
                if (parent != null && !parent.exists()) {
                    parent.mkdirs();
                }
                int commaIdx = base64Chunk.indexOf(',');
                String cleanB64 = commaIdx >= 0 ? base64Chunk.substring(commaIdx + 1) : base64Chunk;
                byte[] decodedBytes = Base64.decode(cleanB64, Base64.DEFAULT);
                try (FileOutputStream fos = new FileOutputStream(targetFile, true)) {
                    fos.write(decodedBytes);
                    fos.flush();
                }
                return true;
            } catch (Exception e) {
                e.printStackTrace();
                return false;
            }
        }

        @JavascriptInterface
        public String finishChunkedMediaSave(final String fileName, final String mimeType) {
            try {
                File targetFile = resolveDownloadTargetFile(fileName);
                if (!targetFile.exists() || targetFile.length() == 0) {
                    return "";
                }
                String resolvedMime = (mimeType != null && !mimeType.isEmpty()) ? mimeType : "video/mp4";
                MediaScannerConnection.scanFile(
                    MainActivity.this,
                    new String[]{ targetFile.getAbsolutePath() },
                    new String[]{ resolvedMime },
                    null
                );
                return targetFile.getAbsolutePath();
            } catch (Exception e) {
                e.printStackTrace();
                return "";
            }
        }

        @JavascriptInterface
        public boolean shareMediaOrText(final String fileName, final String mimeType, final String title, final String text) {
            try {
                final File targetFile = (fileName != null && !fileName.isEmpty()) ? resolveDownloadTargetFile(fileName) : null;
                final boolean hasFile = targetFile != null && targetFile.exists() && targetFile.length() > 0;
                final String safeMime = (mimeType != null && !mimeType.isEmpty()) ? mimeType : "video/mp4";
                final String safeTitle = (title != null && !title.isEmpty()) ? title : "OneDownload";
                final String safeText = (text != null) ? text : "";

                runOnUiThread(() -> {
                    try {
                        Intent shareIntent = new Intent(Intent.ACTION_SEND);
                        if (hasFile) {
                            Uri fileUri = FileProvider.getUriForFile(
                                MainActivity.this,
                                getPackageName() + ".fileprovider",
                                targetFile
                            );
                            shareIntent.setType(safeMime);
                            shareIntent.putExtra(Intent.EXTRA_STREAM, fileUri);
                            if (!safeText.isEmpty()) {
                                shareIntent.putExtra(Intent.EXTRA_TEXT, safeText);
                            }
                            shareIntent.putExtra(Intent.EXTRA_TITLE, safeTitle);
                            ClipData clipData = ClipData.newRawUri(targetFile.getName(), fileUri);
                            shareIntent.setClipData(clipData);
                            shareIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                        } else {
                            shareIntent.setType("text/plain");
                            shareIntent.putExtra(Intent.EXTRA_SUBJECT, safeTitle);
                            shareIntent.putExtra(Intent.EXTRA_TEXT, safeText.isEmpty() ? safeTitle : safeText);
                        }

                        Intent chooser = Intent.createChooser(shareIntent, "اشتراک‌گذاری با...");
                        chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
                        startActivity(chooser);
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

        private File resolveDownloadTargetFile(String fileName) {
            String safeName = (fileName == null || fileName.trim().isEmpty())
                ? ("OneDownload_" + System.currentTimeMillis() + ".mp4")
                : fileName.replaceAll("[\\\\/:*?\"<>|]", "_").trim();
            try {
                File publicDownloads = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
                File odDir = new File(publicDownloads, "OneDownload");
                if (!odDir.exists()) {
                    odDir.mkdirs();
                }
                if (odDir.exists() && odDir.canWrite()) {
                    return new File(odDir, safeName);
                }
                if (publicDownloads != null && publicDownloads.exists() && publicDownloads.canWrite()) {
                    return new File(publicDownloads, safeName);
                }
            } catch (Exception ignored) {}

            File fallbackDir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
            if (fallbackDir == null) {
                fallbackDir = getCacheDir();
            }
            File odFallback = new File(fallbackDir, "OneDownload");
            if (!odFallback.exists()) {
                odFallback.mkdirs();
            }
            return new File(odFallback, safeName);
        }

        @JavascriptInterface
        public boolean savePersistentJson(final String key, final String jsonValue) {
            if (key == null || key.trim().isEmpty() || jsonValue == null) return false;
            try {
                String safeKey = key.replaceAll("[^A-Za-z0-9_.-]", "_");
                File storeDir = new File(getFilesDir(), "od_permanent_vault");
                if (!storeDir.exists()) {
                    storeDir.mkdirs();
                }
                File target = new File(storeDir, safeKey + ".json");
                try (FileOutputStream fos = new FileOutputStream(target, false)) {
                    fos.write(jsonValue.getBytes(StandardCharsets.UTF_8));
                    fos.flush();
                }
                return true;
            } catch (Exception e) {
                e.printStackTrace();
                return false;
            }
        }

        @JavascriptInterface
        public String loadPersistentJson(final String key) {
            if (key == null || key.trim().isEmpty()) return "";
            try {
                String safeKey = key.replaceAll("[^A-Za-z0-9_.-]", "_");
                File storeDir = new File(getFilesDir(), "od_permanent_vault");
                File target = new File(storeDir, safeKey + ".json");
                if (!target.exists() || target.length() == 0) return "";
                byte[] bytes = new byte[(int) target.length()];
                try (FileInputStream fis = new FileInputStream(target)) {
                    int offset = 0;
                    while (offset < bytes.length) {
                        int read = fis.read(bytes, offset, bytes.length - offset);
                        if (read == -1) break;
                        offset += read;
                    }
                }
                return new String(bytes, StandardCharsets.UTF_8);
            } catch (Exception e) {
                e.printStackTrace();
                return "";
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
