package org.listeninghouse.checkin;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.HashSet;
import java.util.Set;

final class ActivityAlarmScheduler {
    private static final String PREFS_NAME = "listening_house_activity_alarms";
    private static final String KEY_IDS = "scheduled_ids";

    private ActivityAlarmScheduler() {}

    static void sync(Context context, String alarmsJson) {
        try {
            JSONArray alarms = new JSONArray(alarmsJson == null ? "[]" : alarmsJson);
            Set<String> nextIds = new HashSet<>();
            for (int index = 0; index < alarms.length(); index += 1) {
                JSONObject alarm = alarms.getJSONObject(index);
                String id = alarm.optString("id", "");
                if (id.length() == 0) continue;
                nextIds.add(id);
                schedule(
                    context,
                    id,
                    alarm.optLong("triggerAt", System.currentTimeMillis() + 1000),
                    alarm.optString("guestName", "Guest"),
                    alarm.optString("activityName", "Activity"),
                    Math.max(1, alarm.optInt("minutesLeft", 5))
                );
            }

            Set<String> previousIds = new HashSet<>(
                context
                    .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                    .getStringSet(KEY_IDS, new HashSet<>())
            );
            for (String previousId : previousIds) {
                if (!nextIds.contains(previousId)) cancel(context, previousId);
            }
            context
                .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .edit()
                .putStringSet(KEY_IDS, new HashSet<>(nextIds))
                .apply();
        } catch (Exception ignored) {
            // The website will continue providing its visible and audible alarm.
        }
    }

    static void cancelAll(Context context) {
        Set<String> ids = new HashSet<>(
            context
                .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .getStringSet(KEY_IDS, new HashSet<>())
        );
        for (String id : ids) cancel(context, id);
        context
            .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .remove(KEY_IDS)
            .apply();
    }

    static void test(Context context) {
        ActivityAlarmReceiver.showNotification(
            context,
            "test",
            "Test guest",
            "Timer alarm test",
            5
        );
    }

    private static void schedule(
        Context context,
        String id,
        long triggerAt,
        String guestName,
        String activityName,
        int minutesLeft
    ) {
        AlarmManager manager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (manager == null) return;

        long safeTriggerAt = Math.max(System.currentTimeMillis() + 750, triggerAt);
        PendingIntent pendingIntent = alarmPendingIntent(
            context,
            id,
            guestName,
            activityName,
            minutesLeft,
            PendingIntent.FLAG_UPDATE_CURRENT
        );
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !manager.canScheduleExactAlarms()) {
            manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, safeTriggerAt, pendingIntent);
            return;
        }
        manager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, safeTriggerAt, pendingIntent);
    }

    private static void cancel(Context context, String id) {
        AlarmManager manager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        PendingIntent pendingIntent = alarmPendingIntent(
            context,
            id,
            "",
            "",
            5,
            PendingIntent.FLAG_NO_CREATE
        );
        if (manager != null && pendingIntent != null) {
            manager.cancel(pendingIntent);
            pendingIntent.cancel();
        }
    }

    private static PendingIntent alarmPendingIntent(
        Context context,
        String id,
        String guestName,
        String activityName,
        int minutesLeft,
        int baseFlag
    ) {
        Intent intent = new Intent(context, ActivityAlarmReceiver.class);
        intent.putExtra("alarm_id", id);
        intent.putExtra("guest_name", guestName);
        intent.putExtra("activity_name", activityName);
        intent.putExtra("minutes_left", minutesLeft);
        int flags = baseFlag | PendingIntent.FLAG_IMMUTABLE;
        return PendingIntent.getBroadcast(context, requestCode(id), intent, flags);
    }

    private static int requestCode(String id) {
        return id.hashCode() & 0x7fffffff;
    }
}
