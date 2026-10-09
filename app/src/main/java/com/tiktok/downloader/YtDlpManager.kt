package com.tiktok.downloader

import android.content.Context
import android.media.MediaScannerConnection
import android.os.Environment
import com.yausername.ffmpeg.FFmpeg
import com.yausername.youtubedl_android.YoutubeDL
import com.yausername.youtubedl_android.YoutubeDLRequest
import org.json.JSONObject
import java.io.File

object YtDlpManager {
    @Volatile
    var isReady = false
        private set

    @Volatile
    private var isInitializing = false
    private var initError: String? = null

    fun init(context: Context) {
        if (isReady || isInitializing) return
        isInitializing = true
        Thread {
            try {
                YoutubeDL.getInstance().init(context.applicationContext)
                FFmpeg.getInstance().init(context.applicationContext)
                isReady = true
                try {
                    YoutubeDL.getInstance().updateYoutubeDL(context.applicationContext, YoutubeDL.UpdateChannel.STABLE)
                } catch (_: Exception) {
                    // Ignorar fallos de red en actualización silenciosa inicial
                }
            } catch (e: Exception) {
                initError = e.message
                isReady = false
            } finally {
                isInitializing = false
            }
        }.start()
    }

    private fun ensureReady(context: Context) {
        if (isReady) return
        init(context)
        val start = System.currentTimeMillis()
        while (!isReady && (System.currentTimeMillis() - start) < 15000) {
            Thread.sleep(150)
        }
        if (!isReady) {
            throw Exception(initError ?: "Inicializando motor yt-dlp...")
        }
    }

    fun getInfo(context: Context, url: String): String {
        ensureReady(context)
        val ytdl = YoutubeDL.getInstance()
        val info = ytdl.getInfo(url)
        return JSONObject().apply {
            put("id", info.id ?: System.currentTimeMillis().toString())
            put("title", info.title ?: "Video")
            put("cover", info.thumbnail ?: "")
            put("duration", info.duration)
            put("url", info.url ?: "")
            put("uploader", info.uploader ?: "")
            put("ext", info.ext ?: "mp4")
            put("isImages", false)
            put("isYtDlp", true)
        }.toString()
    }

    fun download(
        context: Context,
        url: String,
        format: String,
        onProgress: (Float, String) -> Unit
    ): File {
        ensureReady(context)
        val downloadDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
        if (!downloadDir.exists()) downloadDir.mkdirs()

        val ytdl = YoutubeDL.getInstance()
        val request = YoutubeDLRequest(url)

        val outPattern = File(downloadDir, "%(title).40s_%(id)s.%(ext)s").absolutePath
        request.addOption("-o", outPattern)
        request.addOption("--restrict-filenames")
        request.addOption("--no-mtime")

        if (format.lowercase() == "mp3") {
            request.addOption("-x")
            request.addOption("--audio-format", "mp3")
        } else {
            request.addOption("-f", "bestvideo+bestaudio/best")
            request.addOption("--merge-output-format", "mp4")
        }

        val processId = "dl_${System.currentTimeMillis()}"
        ytdl.execute(request, processId) { progress, _, text ->
            onProgress(progress / 100f, text)
        }

        val ext = if (format.lowercase() == "mp3") "mp3" else "mp4"
        val matched = downloadDir.listFiles()?.filter {
            it.extension.equals(ext, ignoreCase = true)
        }?.maxByOrNull { it.lastModified() } ?: File(downloadDir, "download.$ext")

        MediaScannerConnection.scanFile(
            context,
            arrayOf(matched.absolutePath),
            arrayOf(if (ext == "mp3") "audio/mpeg" else "video/mp4"),
            null
        )
        return matched
    }

    fun getVersion(context: Context): String? {
        ensureReady(context)
        return try {
            YoutubeDL.getInstance().version(context.applicationContext)
        } catch (_: Exception) {
            null
        }
    }

    fun updateYtDlp(context: Context): Pair<String, String> {
        ensureReady(context)
        val status = YoutubeDL.getInstance().updateYoutubeDL(context.applicationContext, YoutubeDL.UpdateChannel.STABLE)
        val ver = getVersion(context) ?: ""
        val statusStr = when (status) {
            YoutubeDL.UpdateStatus.ALREADY_UP_TO_DATE -> "ALREADY_UP_TO_DATE"
            YoutubeDL.UpdateStatus.DONE -> "DONE"
            else -> status?.name ?: "UNKNOWN"
        }
        return Pair(statusStr, ver)
    }
}
