package com.tiktok.downloader

import android.content.ContentValues
import android.content.Context
import android.media.MediaScannerConnection
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

object MediaMerger {

    fun mergeImageAndAudio(
        context: Context,
        imageUrl: String,
        audioUrl: String,
        filename: String,
        onProgress: (Float, String) -> Unit
    ): File {
        val cacheDir = File(context.cacheDir, "merger").apply { if (!exists()) mkdirs() }
        val tempImg = File(cacheDir, "img_${System.currentTimeMillis()}.tmp")
        val tempAudio = File(cacheDir, "audio_${System.currentTimeMillis()}.tmp")
        val tempOut = File(cacheDir, "out_${System.currentTimeMillis()}.mp4")

        try {
            onProgress(0.15f, "Descargando imagen...")
            downloadToFile(imageUrl, tempImg)

            onProgress(0.40f, "Descargando audio completo...")
            downloadToFile(audioUrl, tempAudio)

            onProgress(0.65f, "Generando video...")

            val ffmpegBin = File(context.applicationInfo.nativeLibraryDir, "libffmpeg.so")
            if (!ffmpegBin.exists()) {
                throw Exception("Motor de video FFmpeg no disponible en este dispositivo")
            }

            val packagesDir = File(context.getNoBackupFilesDir(), "youtubedl-android/packages/ffmpeg/usr/lib")
            val libPaths = if (packagesDir.exists()) {
                "${packagesDir.absolutePath}:${context.applicationInfo.nativeLibraryDir}"
            } else {
                context.applicationInfo.nativeLibraryDir
            }

            val cmd = listOf(
                ffmpegBin.absolutePath,
                "-y",
                "-loop", "1",
                "-i", tempImg.absolutePath,
                "-i", tempAudio.absolutePath,
                "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2",
                "-c:v", "libx264",
                "-tune", "stillimage",
                "-c:a", "aac",
                "-b:a", "192k",
                "-pix_fmt", "yuv420p",
                "-shortest",
                tempOut.absolutePath
            )

            val pb = ProcessBuilder(cmd)
            pb.environment()["LD_LIBRARY_PATH"] = libPaths
            pb.redirectErrorStream(true)

            val proc = pb.start()
            val reader = proc.inputStream.bufferedReader()
            var line: String?
            while (reader.readLine().also { line = it } != null) {
                // Log stream
            }
            val exitCode = proc.waitFor()
            if (exitCode != 0 || !tempOut.exists() || tempOut.length() == 0L) {
                throw Exception("Fallo en codificación de video (código $exitCode)")
            }

            onProgress(0.90f, "Guardando en Descargas...")
            val finalFile = saveToDownloads(context, tempOut, filename)
            onProgress(1.0f, "Completado")
            return finalFile
        } finally {
            if (tempImg.exists()) tempImg.delete()
            if (tempAudio.exists()) tempAudio.delete()
            if (tempOut.exists()) tempOut.delete()
        }
    }

    private fun downloadToFile(urlStr: String, dest: File) {
        var currentUrl = urlStr
        var redirects = 0
        var conn: HttpURLConnection? = null
        while (redirects < 5) {
            val u = URL(currentUrl)
            conn = u.openConnection() as HttpURLConnection
            conn.instanceFollowRedirects = false
            conn.connectTimeout = 20000
            conn.readTimeout = 40000
            conn.setRequestProperty("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)")
            conn.connect()
            val code = conn.responseCode
            if (code in 300..399) {
                val loc = conn.getHeaderField("Location") ?: break
                currentUrl = if (loc.startsWith("http")) loc else URL(u, loc).toString()
                conn.disconnect()
                redirects++
            } else if (code in 200..299) {
                break
            } else {
                conn.disconnect()
                throw Exception("HTTP $code al descargar recurso")
            }
        }
        val activeConn = conn ?: throw Exception("No se pudo conectar para descargar recurso")
        activeConn.inputStream.use { input ->
            dest.outputStream().use { output ->
                input.copyTo(output)
            }
        }
        activeConn.disconnect()
    }

    private fun saveToDownloads(context: Context, srcFile: File, filename: String): File {
        val safeName = if (filename.endsWith(".mp4", ignoreCase = true)) filename else "$filename.mp4"
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val values = ContentValues().apply {
                put(MediaStore.MediaColumns.DISPLAY_NAME, safeName)
                put(MediaStore.MediaColumns.MIME_TYPE, "video/mp4")
                put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
            }
            val uri = context.contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
            if (uri != null) {
                context.contentResolver.openOutputStream(uri)?.use { out ->
                    srcFile.inputStream().use { input -> input.copyTo(out) }
                }
            }
        } else {
            val dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
            if (!dir.exists()) dir.mkdirs()
            val destFile = File(dir, safeName)
            srcFile.copyTo(destFile, overwrite = true)
            MediaScannerConnection.scanFile(context, arrayOf(destFile.absolutePath), arrayOf("video/mp4"), null)
        }
        val publicDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
        val resultFile = File(publicDir, safeName)
        if (resultFile.exists()) {
            MediaScannerConnection.scanFile(context, arrayOf(resultFile.absolutePath), arrayOf("video/mp4"), null)
        }
        return resultFile
    }
}
