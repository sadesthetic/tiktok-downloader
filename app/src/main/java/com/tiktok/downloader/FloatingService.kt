package com.tiktok.downloader

import android.annotation.SuppressLint
import android.app.DownloadManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.PixelFormat
import android.graphics.RectF
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.Toast
import androidx.core.app.NotificationCompat
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

class FloatingService : Service() {
    private var windowManager: WindowManager? = null
    private var floatingView: FloatingBubbleView? = null
    private val handler = Handler(Looper.getMainLooper())

    companion object {
        var isRunning = false
        private const val CHANNEL_ID = "floating_overlay_channel"
        private const val NOTIF_ID = 2001
        private const val HOLD_DURATION = 5000L
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        isRunning = true
        startInForeground()
        initOverlay()
    }

    private fun startInForeground() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Botón Flotante",
                NotificationManager.IMPORTANCE_MIN
            ).apply {
                description = "Descargas rápidas"
                setShowBadge(false)
            }
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(channel)
        }

        val notification: Notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle("TikTok Downloader")
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .build()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIF_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
        } else {
            startForeground(NOTIF_ID, notification)
        }
    }

    @SuppressLint("ClickableViewAccessibility")
    private fun initOverlay() {
        windowManager = getSystemService(WINDOW_SERVICE) as WindowManager

        val size = (56 * resources.displayMetrics.density).toInt()
        val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        } else {
            @Suppress("DEPRECATION")
            WindowManager.LayoutParams.TYPE_PHONE
        }

        val params = WindowManager.LayoutParams(
            size,
            size,
            type,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            x = 40
            y = 350
        }

        val bubble = FloatingBubbleView(this)
        var initialX = 0
        var initialY = 0
        var touchStartX = 0f
        var touchStartY = 0f
        var holdStartTime = 0L
        var isHolding = false
        var hasDragged = false

        val holdRunnable = object : Runnable {
            override fun run() {
                if (!isHolding) return
                val elapsed = System.currentTimeMillis() - holdStartTime
                val progress = (elapsed.toFloat() / HOLD_DURATION).coerceIn(0f, 1f)
                bubble.setProgress(progress)

                if (elapsed >= HOLD_DURATION) {
                    vibrate()
                    stopSelf()
                    return
                }
                handler.postDelayed(this, 30)
            }
        }

        bubble.setOnTouchListener { _, event ->
            when (event.action) {
                MotionEvent.ACTION_DOWN -> {
                    initialX = params.x
                    initialY = params.y
                    touchStartX = event.rawX
                    touchStartY = event.rawY
                    isHolding = true
                    hasDragged = false
                    holdStartTime = System.currentTimeMillis()
                    handler.post(holdRunnable)
                    true
                }
                MotionEvent.ACTION_MOVE -> {
                    val dx = (event.rawX - touchStartX).toInt()
                    val dy = (event.rawY - touchStartY).toInt()
                    params.x = initialX + dx
                    params.y = initialY + dy
                    windowManager?.updateViewLayout(bubble, params)
                    if (Math.hypot(dx.toDouble(), dy.toDouble()) > 15) {
                        hasDragged = true
                    }
                    true
                }
                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                    isHolding = false
                    handler.removeCallbacks(holdRunnable)
                    bubble.setProgress(0f)
                    if (!hasDragged) {
                        handleQuickDownload()
                    }
                    true
                }
                else -> false
            }
        }

        floatingView = bubble
        windowManager?.addView(bubble, params)
    }

    private fun handleQuickDownload() {
        val clipboard = getSystemService(CLIPBOARD_SERVICE) as ClipboardManager
        val clip = clipboard.primaryClip
        val text = if (clip != null && clip.itemCount > 0) clip.getItemAt(0).text?.toString() ?: "" else ""
        val regex = Regex("https?://[^\\s\"')<>]+")
        val url = regex.find(text)?.value

        if (url == null) {
            Toast.makeText(this, "Copia el enlace en TikTok", Toast.LENGTH_SHORT).show()
            return
        }

        Toast.makeText(this, "Obteniendo contenido...", Toast.LENGTH_SHORT).show()
        Thread {
            try {
                val apiUrl = "https://www.tikwm.com/api/?url=${URLEncoder.encode(url, "UTF-8")}"
                val conn = URL(apiUrl).openConnection() as HttpURLConnection
                conn.connectTimeout = 10000
                conn.readTimeout = 15000
                val body = conn.inputStream.bufferedReader().use { it.readText() }
                val json = JSONObject(body)
                val data = json.optJSONObject("data")

                if (data == null) {
                    handler.post { Toast.makeText(this, "Enlace no válido", Toast.LENGTH_SHORT).show() }
                    return@Thread
                }

                val id = data.optString("id", System.currentTimeMillis().toString())
                val images = data.optJSONArray("images")

                if (images != null && images.length() > 0) {
                    for (i in 0 until images.length()) {
                        val imgUrl = images.getString(i)
                        enqueueDownload(imgUrl, "tiktok_${id}_${i + 1}.jpg", "image/jpeg")
                    }
                    handler.post { Toast.makeText(this, "Descargando ${images.length()} fotos", Toast.LENGTH_SHORT).show() }
                } else {
                    val playUrl = data.optString("play", "")
                    if (playUrl.isNotEmpty()) {
                        enqueueDownload(playUrl, "tiktok_${id}.mp4", "video/mp4")
                        handler.post { Toast.makeText(this, "Descargando video", Toast.LENGTH_SHORT).show() }
                    } else {
                        handler.post { Toast.makeText(this, "No se encontró multimedia", Toast.LENGTH_SHORT).show() }
                    }
                }
            } catch (e: Exception) {
                handler.post { Toast.makeText(this, "Error: ${e.message}", Toast.LENGTH_SHORT).show() }
            }
        }.start()
    }

    private fun enqueueDownload(url: String, filename: String, mimeType: String) {
        val request = DownloadManager.Request(Uri.parse(url)).apply {
            setTitle(filename)
            setDescription("TikTok Downloader")
            setMimeType(mimeType)
            setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
            setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, filename)
            setAllowedOverMetered(true)
            setAllowedOverRoaming(true)
        }
        val dm = getSystemService(DOWNLOAD_SERVICE) as DownloadManager
        dm.enqueue(request)
    }

    private fun vibrate() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val vm = getSystemService(VIBRATOR_MANAGER_SERVICE) as VibratorManager
                vm.defaultVibrator.vibrate(VibrationEffect.createOneShot(50, VibrationEffect.DEFAULT_AMPLITUDE))
            } else {
                @Suppress("DEPRECATION")
                val v = getSystemService(VIBRATOR_SERVICE) as Vibrator
                v.vibrate(50)
            }
        } catch (_: Exception) {}
    }

    override fun onDestroy() {
        super.onDestroy()
        isRunning = false
        floatingView?.let { windowManager?.removeView(it) }
        floatingView = null
    }

    private class FloatingBubbleView(context: Context) : View(context) {
        private var progress = 0f
        private val bgPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.parseColor("#CC121217")
            style = Paint.Style.FILL
        }
        private val strokePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.parseColor("#44FFFFFF")
            style = Paint.Style.STROKE
            strokeWidth = 3f
        }
        private val progressPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.parseColor("#00F2FE")
            style = Paint.Style.STROKE
            strokeWidth = 5f
            strokeCap = Paint.Cap.ROUND
        }
        private val iconPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.WHITE
            style = Paint.Style.STROKE
            strokeWidth = 4f
            strokeCap = Paint.Cap.ROUND
            strokeJoin = Paint.Join.ROUND
        }
        private val arrowPath = Path()
        private val arcRect = RectF()

        fun setProgress(value: Float) {
            progress = value
            invalidate()
        }

        override fun onDraw(canvas: Canvas) {
            super.onDraw(canvas)
            val cx = width / 2f
            val cy = height / 2f
            val radius = (width / 2f) - 6f

            canvas.drawCircle(cx, cy, radius, bgPaint)
            canvas.drawCircle(cx, cy, radius, strokePaint)

            if (progress > 0f) {
                arcRect.set(cx - radius, cy - radius, cx + radius, cy + radius)
                canvas.drawArc(arcRect, -90f, progress * 360f, false, progressPaint)
            }

            arrowPath.reset()
            arrowPath.moveTo(cx, cy - 12f)
            arrowPath.lineTo(cx, cy + 8f)
            arrowPath.moveTo(cx - 8f, cy)
            arrowPath.lineTo(cx, cy + 8f)
            arrowPath.lineTo(cx + 8f, cy)
            arrowPath.moveTo(cx - 10f, cy + 14f)
            arrowPath.lineTo(cx + 10f, cy + 14f)
            canvas.drawPath(arrowPath, iconPaint)
        }
    }
}
