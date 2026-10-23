package ir.appone.onedownload;

import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import androidx.core.content.FileProvider;
import com.getcapacitor.BridgeActivity;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (this.bridge != null && this.bridge.getWebView() != null) {
            this.bridge.getWebView().addJavascriptInterface(new OneDownloadNativeBridge(), "OneDownloadNative");
        }
    }

    public class OneDownloadNativeBridge {

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
