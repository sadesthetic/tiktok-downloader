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
            pInfo.versionName ?: "1.0.9"
        } catch (_: Exception) {
            "1.0.9"
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

    @JavascriptInterface
    fun installUpdate(url: String) {
        val handler = Handler(Looper.getMainLooper())

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !context.packageManager.canRequestPackageInstalls()) {
            handler.post {
                Toast.makeText(context, "Permite instalar apps desconocidas", Toast.LENGTH_SHORT).show()
                val settingsIntent = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES).apply {
                    data = Uri.parse("package:${context.packageName}")
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                context.startActivity(settingsIntent)
            }
            return
        }

        val apkFile = File(context.cacheDir, "update.apk")
        val currentCode = try {
            val pInfo = context.packageManager.getPackageInfo(context.packageName, 0)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) pInfo.longVersionCode else pInfo.versionCode.toLong()
        } catch (_: Exception) { 0L }

        if (apkFile.exists()) {
            if (apkFile.length() > 1_000_000L) {
                val archiveInfo = context.packageManager.getPackageArchiveInfo(apkFile.absolutePath, 0)
                if (archiveInfo != null) {
                    val apkCode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) archiveInfo.longVersionCode else archiveInfo.versionCode.toLong()
                    if (apkCode > currentCode) {
                        handler.post {
                            Toast.makeText(context, "Abriendo instalador...", Toast.LENGTH_SHORT).show()
                            openApkInstaller(apkFile)
                        }
                        webView?.post {
                            webView?.evaluateJavascript("window.onUpdateProgress && window.onUpdateProgress(1.0); window.onUpdateComplete && window.onUpdateComplete();", null)
                        }
                        return
                    }
                }
            }
            apkFile.delete()
        }

        handler.post {
            Toast.makeText(context, "Descargando actualización...", Toast.LENGTH_SHORT).show()
        }

        Thread {
            val tempFile = File(context.cacheDir, "update.apk.tmp")
            try {
                if (tempFile.exists()) tempFile.delete()

                val connection = URL(url).openConnection() as HttpURLConnection
                connection.instanceFollowRedirects = true
                connection.connectTimeout = 15000
                connection.readTimeout = 30000
                connection.setRequestProperty("Cache-Control", "no-cache, no-store")
                connection.setRequestProperty("Pragma", "no-cache")
                connection.connect()

                if (connection.responseCode !in 200..299) {
                    throw Exception("HTTP ${connection.responseCode}")
                }

                val totalBytes = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                    connection.contentLengthLong
                } else {
                    connection.contentLength.toLong()
                }

                var downloadedBytes = 0L
                var lastReport = 0L

                connection.inputStream.use { input ->
                    tempFile.outputStream().use { output ->
                        val buffer = ByteArray(32 * 1024)
                        var bytesRead: Int
                        while (input.read(buffer).also { bytesRead = it } != -1) {
                            output.write(buffer, 0, bytesRead)
                            downloadedBytes += bytesRead
                            val now = System.currentTimeMillis()
                            if (totalBytes > 0 && now - lastReport > 80) {
                                lastReport = now
                                val progress = (downloadedBytes.toDouble() / totalBytes.toDouble()).coerceIn(0.0, 1.0)
                                webView?.post {
                                    webView?.evaluateJavascript("window.onUpdateProgress && window.onUpdateProgress($progress);", null)
                                }
                            }
                        }
                    }
                }

                if (apkFile.exists()) apkFile.delete()
                tempFile.renameTo(apkFile)

                webView?.post {
                    webView?.evaluateJavascript("window.onUpdateProgress && window.onUpdateProgress(1.0); window.onUpdateComplete && window.onUpdateComplete();", null)
                }

                handler.post {
                    openApkInstaller(apkFile)
                }
            } catch (e: Exception) {
                if (tempFile.exists()) tempFile.delete()
                webView?.post {
                    val safeErr = (e.message ?: "Error").replace("'", "\\'")
                    webView?.evaluateJavascript("window.onUpdateError && window.onUpdateError('$safeErr');", null)
                }
                handler.post {
                    Toast.makeText(context, "Error al descargar: ${e.message}", Toast.LENGTH_LONG).show()
                }
            }
        }.start()
    }

    private fun openApkInstaller(apkFile: File) {
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
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                putExtra(Intent.EXTRA_NOT_UNKNOWN_SOURCE, true)
            }

            val resolveLists = context.packageManager.queryIntentActivities(installIntent, 0)
            for (resolveInfo in resolveLists) {
                context.grantUriPermission(
                    resolveInfo.activityInfo.packageName,
                    apkUri,
                    Intent.FLAG_GRANT_READ_URI_PERMISSION
                )
            }

            context.startActivity(installIntent)
        } catch (e: Exception) {
            Toast.makeText(context, "Error al abrir instalador: ${e.message}", Toast.LENGTH_LONG).show()
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
}
