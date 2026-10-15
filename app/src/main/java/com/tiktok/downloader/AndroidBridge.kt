package com.tiktok.downloader

import android.app.DownloadManager
import android.content.ClipboardManager
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.media.MediaScannerConnection
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import android.provider.Settings
import android.util.Base64
import android.webkit.JavascriptInterface
import android.widget.Toast
import androidx.core.content.FileProvider
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL

class AndroidBridge(private val context: Context, var webView: android.webkit.WebView? = null) {
    var pendingUrl: String? = null

    @JavascriptInterface
    fun getSharedUrl(): String {
        val url = pendingUrl ?: ""
        pendingUrl = null
        return url
    }

    @JavascriptInterface
    fun getAppVersion(): String {
        return try {
            val pInfo = context.packageManager.getPackageInfo(context.packageName, 0)
            pInfo.versionName ?: "1.2.0"
        } catch (_: Exception) {
            "1.2.0"
        }
    }

    @JavascriptInterface
    fun getAppVersionCode(): Int {
        return try {
            val pInfo = context.packageManager.getPackageInfo(context.packageName, 0)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                pInfo.longVersionCode.toInt()
            } else {
                @Suppress("DEPRECATION")
                pInfo.versionCode
            }
        } catch (_: Exception) {
            13
        }
    }

    @JavascriptInterface
    fun download(url: String, filename: String, mimeType: String) {
        try {
            val request = DownloadManager.Request(Uri.parse(url)).apply {
                setTitle(filename)
                setDescription("TikTok Downloader")
                setMimeType(mimeType)
                setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, filename)
                setAllowedOverMetered(true)
                setAllowedOverRoaming(true)
            }
            val dm = context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
            dm.enqueue(request)
            Toast.makeText(context, "Descargando: $filename", Toast.LENGTH_SHORT).show()
        } catch (e: Exception) {
            Toast.makeText(context, "Error: ${e.message}", Toast.LENGTH_LONG).show()
        }
    }

    @JavascriptInterface
    fun saveBase64(base64Data: String, filename: String, mimeType: String) {
        try {
            val cleanBase64 = if (base64Data.contains(",")) base64Data.substringAfter(",") else base64Data
            val bytes = Base64.decode(cleanBase64, Base64.DEFAULT)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val values = ContentValues().apply {
                    put(MediaStore.MediaColumns.DISPLAY_NAME, filename)
                    put(MediaStore.MediaColumns.MIME_TYPE, mimeType)
                    put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
                }
                val uri = context.contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
                if (uri != null) {
                    context.contentResolver.openOutputStream(uri)?.use { it.write(bytes) }
                }
            } else {
                val dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
                if (!dir.exists()) dir.mkdirs()
                val file = File(dir, filename)
                file.outputStream().use { it.write(bytes) }
                MediaScannerConnection.scanFile(context, arrayOf(file.absolutePath), arrayOf(mimeType), null)
            }
            Toast.makeText(context, "Guardado: $filename", Toast.LENGTH_SHORT).show()
        } catch (e: Exception) {
            Toast.makeText(context, "Error: ${e.message}", Toast.LENGTH_LONG).show()
        }
    }

    private var chunkFile: File? = null
    private var chunkOutput: FileOutputStream? = null

    @JavascriptInterface
    fun saveChunkInit(filename: String) {
        try {
            val dir = File(context.cacheDir, "chunks").apply { if (!exists()) mkdirs() }
            val file = File(dir, filename).apply { if (exists()) delete() }
            chunkFile = file
            chunkOutput = FileOutputStream(file)
        } catch (e: Exception) {
            Toast.makeText(context, "Error: ${e.message}", Toast.LENGTH_SHORT).show()
        }
    }

    @JavascriptInterface
    fun saveChunkWrite(base64Chunk: String) {
        try {
            val bytes = Base64.decode(base64Chunk, Base64.DEFAULT)
            chunkOutput?.write(bytes)
        } catch (e: Exception) {
            Toast.makeText(context, "Error chunk: ${e.message}", Toast.LENGTH_SHORT).show()
        }
    }

    @JavascriptInterface
    fun saveChunkFinish(filename: String, mimeType: String) {
        try {
            chunkOutput?.flush()
            chunkOutput?.close()
            chunkOutput = null

            val file = chunkFile ?: return
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val values = ContentValues().apply {
                    put(MediaStore.MediaColumns.DISPLAY_NAME, filename)
                    put(MediaStore.MediaColumns.MIME_TYPE, mimeType)
                    put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
                }
                val uri = context.contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
                if (uri != null) {
                    context.contentResolver.openOutputStream(uri)?.use { out ->
                        file.inputStream().use { input -> input.copyTo(out) }
                    }
                }
                file.delete()
            } else {
                val dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
                if (!dir.exists()) dir.mkdirs()
                val destFile = File(dir, filename)
                file.copyTo(destFile, overwrite = true)
                file.delete()
                MediaScannerConnection.scanFile(context, arrayOf(destFile.absolutePath), arrayOf(mimeType), null)
            }
            Toast.makeText(context, "Guardado: $filename", Toast.LENGTH_SHORT).show()
        } catch (e: Exception) {
            Toast.makeText(context, "Error al guardar: ${e.message}", Toast.LENGTH_LONG).show()
        }
    }

    @JavascriptInterface
    fun getClipboard(): String {
        return try {
            val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
            val clip = clipboard.primaryClip
            if (clip != null && clip.itemCount > 0) {
                clip.getItemAt(0).text?.toString() ?: ""
            } else ""
        } catch (e: Exception) {
            ""
        }
    }

    @JavascriptInterface
    fun openUrl(url: String) {
        try {
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
        } catch (e: Exception) {
            Toast.makeText(context, "Error: ${e.message}", Toast.LENGTH_SHORT).show()
        }
    }

    @Volatile
    private var isDownloadingUpdate = false

    @JavascriptInterface
    fun installUpdate(url: String) {
        val handler = Handler(Looper.getMainLooper())

        if (isDownloadingUpdate) {
            handler.post {
                Toast.makeText(context, "La actualización ya se está descargando", Toast.LENGTH_SHORT).show()
            }
            return
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !context.packageManager.canRequestPackageInstalls()) {
            handler.post {
                Toast.makeText(context, "Permite instalar apps desconocidas para actualizar", Toast.LENGTH_LONG).show()
                val settingsIntent = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES).apply {
                    data = Uri.parse("package:${context.packageName}")
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                context.startActivity(settingsIntent)
            }
            return
        }

        isDownloadingUpdate = true
        val updatesDir = File(context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS) ?: context.cacheDir, "updates").apply {
            if (!exists()) mkdirs()
        }
        val apkFile = File(updatesDir, "TikTokDownloader_update.apk")
        val tempFile = File(updatesDir, "TikTokDownloader_update.tmp")

        handler.post {
            Toast.makeText(context, "Iniciando descarga de actualización...", Toast.LENGTH_SHORT).show()
        }

        Thread {
            try {
                if (tempFile.exists()) tempFile.delete()
                if (apkFile.exists()) apkFile.delete()

                var targetUrl = if (url.contains("?")) "$url&_cb=${System.currentTimeMillis()}" else "$url?_cb=${System.currentTimeMillis()}"
                var connection: HttpURLConnection? = null
                var redirects = 0

                while (redirects < 6) {
                    val u = URL(targetUrl)
                    val conn = u.openConnection() as HttpURLConnection
                    conn.instanceFollowRedirects = false
                    conn.connectTimeout = 20000
                    conn.readTimeout = 40000
                    conn.setRequestProperty("User-Agent", "Mozilla/5.0 TikTokDownloader/${getAppVersion()}")
                    conn.setRequestProperty("Accept-Encoding", "identity")
                    conn.setRequestProperty("Cache-Control", "no-cache, no-store")
                    conn.setRequestProperty("Pragma", "no-cache")
                    conn.connect()

                    val code = conn.responseCode
                    if (code in 300..399) {
                        val loc = conn.getHeaderField("Location") ?: throw Exception("Redirección vacía HTTP $code")
                        targetUrl = if (loc.startsWith("http")) loc else URL(u, loc).toString()
                        conn.disconnect()
                        redirects++
                    } else if (code in 200..299) {
                        connection = conn
                        break
                    } else {
                        conn.disconnect()
                        throw Exception("HTTP $code")
                    }
                }

                val activeConn = connection ?: throw Exception("No se pudo conectar al servidor")
                val totalBytes = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                    activeConn.contentLengthLong
                } else {
                    activeConn.contentLength.toLong()
                }

                var downloadedBytes = 0L
                var lastReportTime = 0L
                var maxProgressReported = 0.0

                activeConn.inputStream.use { input ->
                    tempFile.outputStream().use { output ->
                        val buffer = ByteArray(64 * 1024)
                        var bytesRead: Int
                        while (input.read(buffer).also { bytesRead = it } != -1) {
                            output.write(buffer, 0, bytesRead)
                            downloadedBytes += bytesRead
                            val now = System.currentTimeMillis()

                            if (totalBytes > 0) {
                                val rawProgress = (downloadedBytes.toDouble() / totalBytes.toDouble()).coerceIn(0.0, 1.0)
                                if (rawProgress >= maxProgressReported && (now - lastReportTime > 50 || rawProgress >= 1.0)) {
                                    maxProgressReported = rawProgress
                                    lastReportTime = now
                                    val percent = Math.round(maxProgressReported * 100.0).toInt()
                                    val dlMb = downloadedBytes / (1024.0 * 1024.0)
                                    val totalMb = totalBytes / (1024.0 * 1024.0)

                                    webView?.post {
                                        webView?.evaluateJavascript(
                                            "window.onUpdateProgress && window.onUpdateProgress($maxProgressReported, $percent, $dlMb, $totalMb);",
                                            null
                                        )
                                    }
                                }
                            }
                        }
                    }
                }

                activeConn.disconnect()

                if (!tempFile.exists() || tempFile.length() < 1_000_000L) {
                    throw Exception("Descarga incompleta (${tempFile.length()} bytes)")
                }

                if (apkFile.exists()) apkFile.delete()
                if (!tempFile.renameTo(apkFile)) {
                    tempFile.copyTo(apkFile, overwrite = true)
                    tempFile.delete()
                }

                webView?.post {
                    webView?.evaluateJavascript("window.onUpdateProgress && window.onUpdateProgress(1.0, 100); window.onUpdateComplete && window.onUpdateComplete();", null)
                }

                handler.post {
                    openApkInstaller(apkFile)
                }
            } catch (e: Exception) {
                if (tempFile.exists()) tempFile.delete()
                val safeErr = (e.message ?: "Error desconocido").replace("'", "\\'")
                webView?.post {
                    webView?.evaluateJavascript("window.onUpdateError && window.onUpdateError('$safeErr');", null)
                }
                handler.post {
                    Toast.makeText(context, "Error al actualizar: ${e.message}", Toast.LENGTH_LONG).show()
                }
            } finally {
                isDownloadingUpdate = false
            }
        }.start()
    }

    private fun openApkInstaller(apkFile: File) {
        val handler = Handler(Looper.getMainLooper())
        try {
            apkFile.setReadable(true, false)
            val apkUri = FileProvider.getUriForFile(
                context,
                "${context.packageName}.provider",
                apkFile
            )

            val installIntent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(apkUri, "application/vnd.android.package-archive")
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                addFlags(Intent.FLAG_GRANT_PREFIX_URI_PERMISSION)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP)
                putExtra(Intent.EXTRA_NOT_UNKNOWN_SOURCE, true)
            }

            val installerPackages = arrayOf(
                "com.google.android.packageinstaller",
                "com.android.packageinstaller",
                "com.samsung.android.packageinstaller",
                "com.miui.packageinstaller"
            )
            for (pkg in installerPackages) {
                try {
                    context.grantUriPermission(pkg, apkUri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
                } catch (_: Exception) {}
            }

            try {
                val resolveLists = context.packageManager.queryIntentActivities(installIntent, 0)
                for (resolveInfo in resolveLists) {
                    context.grantUriPermission(
                        resolveInfo.activityInfo.packageName,
                        apkUri,
                        Intent.FLAG_GRANT_READ_URI_PERMISSION
                    )
                }
            } catch (_: Exception) {}

            context.startActivity(installIntent)
        } catch (e: Exception) {
            handler.post {
                Toast.makeText(context, "Error al abrir instalador: ${e.message}", Toast.LENGTH_LONG).show()
            }
        }
    }

    @JavascriptInterface
    fun isNative(): Boolean = true

    @JavascriptInterface
    fun isYtDlpReady(): Boolean = YtDlpManager.isReady

    @JavascriptInterface
    fun ytDlpGetInfo(url: String): String {
        return try {
            YtDlpManager.getInfo(context, url)
        } catch (e: Exception) {
            org.json.JSONObject().apply {
                put("error", e.message ?: "Error al obtener información")
            }.toString()
        }
    }

    @JavascriptInterface
    fun ytDlpDownload(url: String, format: String) {
        val handler = Handler(Looper.getMainLooper())
        handler.post {
            Toast.makeText(context, "Iniciando descarga ($format)...", Toast.LENGTH_SHORT).show()
        }
        Thread {
            try {
                val file = YtDlpManager.download(context, url, format) { progress, text ->
                    webView?.post {
                        val cleanText = text.replace("'", "\\'").replace("\n", " ")
                        webView?.evaluateJavascript(
                            "window.onYtDlpProgress && window.onYtDlpProgress($progress, '$cleanText');",
                            null
                        )
                    }
                }
                handler.post {
                    Toast.makeText(context, "Descargado: ${file.name}", Toast.LENGTH_LONG).show()
                }
                webView?.post {
                    val safeName = file.name.replace("'", "\\'")
                    webView?.evaluateJavascript(
                        "window.onYtDlpComplete && window.onYtDlpComplete('$safeName', '$format');",
                        null
                    )
                }
            } catch (e: Exception) {
                handler.post {
                    Toast.makeText(context, "Error: ${e.message}", Toast.LENGTH_LONG).show()
                }
                webView?.post {
                    val safeErr = (e.message ?: "Error al descargar").replace("'", "\\'")
                    webView?.evaluateJavascript(
                        "window.onYtDlpError && window.onYtDlpError('$safeErr');",
                        null
                    )
                }
            }
        }.start()
    }

    @JavascriptInterface
    fun getYtDlpVersion(): String {
        return try {
            YtDlpManager.getVersion(context) ?: "Desconocida"
        } catch (e: Exception) {
            "Desconocida"
        }
    }

    @JavascriptInterface
    fun updateYtDlp() {
        val handler = Handler(Looper.getMainLooper())
        handler.post {
            Toast.makeText(context, "Verificando actualización de yt-dlp...", Toast.LENGTH_SHORT).show()
        }
        Thread {
            try {
                val (status, version) = YtDlpManager.updateYtDlp(context)
                val msg = if (status == "DONE") {
                    "yt-dlp actualizado a la versión $version"
                } else {
                    "yt-dlp ya está en la última versión ($version)"
                }
                handler.post {
                    Toast.makeText(context, msg, Toast.LENGTH_SHORT).show()
                }
                webView?.post {
                    val safeVer = version.replace("'", "\\'")
                    val safeStatus = status.replace("'", "\\'")
                    webView?.evaluateJavascript(
                        "window.onYtDlpUpdateComplete && window.onYtDlpUpdateComplete('$safeStatus', '$safeVer');",
                        null
                    )
                }
            } catch (e: Exception) {
                val err = e.message ?: "Error al actualizar yt-dlp"
                handler.post {
                    Toast.makeText(context, "Error: $err", Toast.LENGTH_LONG).show()
                }
                webView?.post {
                    val safeErr = err.replace("'", "\\'")
                    webView?.evaluateJavascript(
                        "window.onYtDlpUpdateError && window.onYtDlpUpdateError('$safeErr');",
                        null
                    )
                }
            }
        }.start()
    }

    @JavascriptInterface
    fun mergeImageAudio(imageUrl: String, audioUrl: String, filename: String) {
        val handler = Handler(Looper.getMainLooper())
        handler.post {
            Toast.makeText(context, "Generando video con audio completo...", Toast.LENGTH_SHORT).show()
        }
        Thread {
            try {
                val file = MediaMerger.mergeImageAndAudio(context, imageUrl, audioUrl, filename) { progress, text ->
                    webView?.post {
                        val cleanText = text.replace("'", "\\'").replace("\n", " ")
                        webView?.evaluateJavascript(
                            "window.onMergeProgress && window.onMergeProgress($progress, '$cleanText');",
                            null
                        )
                    }
                }
                handler.post {
                    Toast.makeText(context, "Video guardado: ${file.name}", Toast.LENGTH_LONG).show()
                }
                webView?.post {
                    val safeName = file.name.replace("'", "\\'")
                    webView?.evaluateJavascript(
                        "window.onMergeComplete && window.onMergeComplete('$safeName');",
                        null
                    )
                }
            } catch (e: Exception) {
                val safeErr = (e.message ?: "Error al combinar video y audio").replace("'", "\\'")
                webView?.post {
                    webView?.evaluateJavascript(
                        "window.onMergeError && window.onMergeError('$safeErr');",
                        null
                    )
                }
            }
        }.start()
    }
}
