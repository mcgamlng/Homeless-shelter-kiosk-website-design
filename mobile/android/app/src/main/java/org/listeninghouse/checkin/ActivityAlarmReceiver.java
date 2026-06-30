package org.listeninghouse.checkin;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;

public class ActivityAlarmReceiver extends BroadcastReceiver {
    static final String CHANNEL_ID = "listening_house_activity_alarms";

    @Override
    public void onReceive(Context context, Intent intent) {
        showNotification(
            context,
            intent.getStringExtra("alarm_id"),
            intent.getStringExtra("guest_name"),
            intent.getStringExtra("activity_name"),
            Math.max(1, intent.getIntExtra("minutes_left", 5)),
            intent.getStringExtra("notification_title"),
            intent.getStringExtra("notification_body")
        );
    }

    static void ensureChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager =
            (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;
        Uri sound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
        AudioAttributes audioAttributes = new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ALARM)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build();
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            "Staff activity alerts",
            NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription("Alerts staff before activities begin and when time is nearly finished.");
        channel.enableVibration(true);
        channel.setVibrationPattern(new long[] { 0, 500, 180, 500, 180, 700 });
        channel.setSound(sound, audioAttributes);
        manager.createNotificationChannel(channel);
    }

    static void showNotification(
        Context context,
        String alarmId,
        String guestName,
        String activityName,
        int minutesLeft,
        String title,
        String body
    ) {
        if (
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) !=
                PackageManager.PERMISSION_GRANTED
        ) {
            return;
        }
        ensureChannel(context);
        Intent openIntent = new Intent(context, MainActivity.class);
        openIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent contentIntent = PendingIntent.getActivity(
            context,
            0,
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        String safeActivity = activityName == null || activityName.length() == 0
            ? "Activity"
            : activityName;
        String safeGuest = guestName == null || guestName.length() == 0 ? "Guest" : guestName;
        String safeTitle = title == null || title.length() == 0
            ? minutesLeft + " minutes left: " + safeActivity
            : title;
        String safeBody = body == null || body.length() == 0
            ? safeGuest + " is nearing the end of this activity."
            : body;
        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? new Notification.Builder(context, CHANNEL_ID)
            : new Notification.Builder(context);
        builder
            .setSmallIcon(R.drawable.lh_icon)
            .setContentTitle(safeTitle)
            .setContentText(safeBody)
            .setContentIntent(contentIntent)
            .setAutoCancel(true)
            .setCategory(Notification.CATEGORY_ALARM)
            .setPriority(Notification.PRIORITY_MAX)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setVibrate(new long[] { 0, 500, 180, 500, 180, 700 })
            .setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM));

        NotificationManager manager =
            (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) {
            manager.notify(notificationId(alarmId), builder.build());
        }
    }

    private static int notificationId(String alarmId) {
        return ("alarm-" + String.valueOf(alarmId)).hashCode() & 0x7fffffff;
    }
}
