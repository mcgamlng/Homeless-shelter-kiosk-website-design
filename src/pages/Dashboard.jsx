import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Bell,
  BellRing,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Filter,
  LayoutDashboard,
  MapPin,
  RotateCcw,
  Search,
  Trash2,
  X
} from "lucide-react";
import { api } from "../api.js";
import { describeActionTiming, getStaffActionItems, getStartingSoonItems } from "../staffAlerts.js";
import { createDashboardSocket } from "../socket.js";
import { formatTime, minutesBetween, STATUSES } from "../utils.js";

const PIXELS_PER_MINUTE = 3.1;
const DEFAULT_WORKDAY_START = "08:00";
const DEFAULT_WORKDAY_END = "16:00";

export default function Dashboard() {
  const staffToken = sessionStorage.getItem("lh-admin-token") || "";
  const [data, setData] = useState(null);
  const [query, setQuery] = useState("");
  const [activityFilter, setActivityFilter] = useState("all");
  const [message, setMessage] = useState("");
  const [mobilePanel, setMobilePanel] = useState("overview");
  const [resetPin, setResetPin] = useState("");
  const [showReset, setShowReset] = useState(false);
  const [alarmsEnabled, setAlarmsEnabled] = useState(
    () => localStorage.getItem("lh-staff-timer-alerts") === "on"
  );
  const [clockNow, setClockNow] = useState(Date.now());
  const [alerts, setAlerts] = useState([]);
  const alertedItems = useRef(new Set());
  const dismissedAlarmItems = useRef(new Set());
  const startingSoonItems = useRef(new Set());
  const wakeLockRef = useRef(null);
  const nativeAlarmSetupRequested = useRef(false);

  useEffect(() => {
    api
      .getDashboard(staffToken)
      .then(setData)
      .catch((err) => setMessage(err.message));
    const socket = createDashboardSocket(staffToken, setData);
    return () => socket.disconnect();
  }, [staffToken]);

  useEffect(() => {
    const timer = window.setInterval(() => setClockNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!alarmsEnabled || !data) return undefined;
    const checkAlarms = () => {
      const now = Date.now();
      data.scheduledItems.forEach((item) => {
        if (
          !item.is_timed ||
          !item.alarm_enabled ||
          item.status !== "In Progress" ||
          !item.scheduled_end
        ) {
          return;
        }
        const minutesLeft = Math.ceil((new Date(item.scheduled_end).getTime() - now) / 60000);
        const threshold = Number(item.alarm_minutes_before || 5);
        if (
          minutesLeft <= 0 ||
          minutesLeft > threshold ||
          alertedItems.current.has(item.id) ||
          dismissedAlarmItems.current.has(item.id)
        ) {
          return;
        }
        alertedItems.current.add(item.id);
        const alert = {
          id: item.id,
          guestName: item.guest_name,
          activityName: item.activity_name,
          minutesLeft,
          notificationTag: `activity-alarm-${item.id}`,
          nativeAlarmId: `end-${item.id}`
        };
        setAlerts((current) => [alert, ...current].slice(0, 4));
        showActivityNotification(alert);
      });
    };
    checkAlarms();
    const timer = window.setInterval(checkAlarms, 1000);
    return () => window.clearInterval(timer);
  }, [alarmsEnabled, data]);

  useEffect(() => {
    if (!alarmsEnabled || !data) return;
    for (const item of getStartingSoonItems(data.scheduledItems, clockNow)) {
      if (startingSoonItems.current.has(item.id)) continue;
      startingSoonItems.current.add(item.id);
      playAlarmTone(0.1);
      navigator.vibrate?.([350, 140, 350]);
      showStartingSoonNotification(item);
    }
  }, [alarmsEnabled, clockNow, data]);

  useEffect(() => {
    if (!alarmsEnabled || alerts.length === 0) return undefined;
    const soundAlarm = () => {
      playAlarmTone();
      navigator.vibrate?.([500, 180, 500, 180, 700]);
    };
    soundAlarm();
    const timer = window.setInterval(soundAlarm, 4500);
    return () => window.clearInterval(timer);
  }, [alarmsEnabled, alerts.length]);

  useEffect(() => {
    if (!alarmsEnabled || !("wakeLock" in navigator)) return undefined;
    let active = true;
    const requestWakeLock = async () => {
      if (!active || document.visibilityState !== "visible" || wakeLockRef.current) return;
      try {
        wakeLockRef.current = await navigator.wakeLock.request("screen");
        wakeLockRef.current.addEventListener("release", () => {
          wakeLockRef.current = null;
        });
      } catch {
        wakeLockRef.current = null;
      }
    };
    requestWakeLock();
    document.addEventListener("visibilitychange", requestWakeLock);
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", requestWakeLock);
      wakeLockRef.current?.release?.();
      wakeLockRef.current = null;
    };
  }, [alarmsEnabled]);

  useEffect(() => {
    const bridge = window.LHCheckIn;
    if (!bridge?.syncActivityAlarms) return undefined;
    if (alarmsEnabled && !nativeAlarmSetupRequested.current) {
      nativeAlarmSetupRequested.current = true;
      bridge.enableActivityAlarms?.();
    }
    const syncNativeAlarms = () => {
      if (!alarmsEnabled || !data) {
        bridge.cancelAllActivityAlarms?.();
        return;
      }
      const now = Date.now();
      const alarms = data.scheduledItems.flatMap((item) => {
        if (!item.is_timed || !item.alarm_enabled) return [];
        if (item.status === "Waiting" && item.scheduled_start) {
          const startsAt = new Date(item.scheduled_start).getTime();
          if (startsAt < now - 60_000) return [];
          return [
            {
              id: `start-${item.id}`,
              triggerAt: startsAt - 5 * 60_000,
              guestName: item.guest_name,
              activityName: item.activity_name,
              minutesLeft: 5,
              title: `${item.guest_name} is ready soon`,
              body: `${item.activity_name} starts at ${formatTime(item.scheduled_start)}. Please call the guest.`
            }
          ];
        }
        if (item.status === "In Progress" && item.scheduled_end) {
          if (dismissedAlarmItems.current.has(item.id)) return [];
          const minutesLeft = Number(item.alarm_minutes_before || 5);
          return [
            {
              id: `end-${item.id}`,
              triggerAt: new Date(item.scheduled_end).getTime() - minutesLeft * 60_000,
              guestName: item.guest_name,
              activityName: item.activity_name,
              minutesLeft,
              title: `${minutesLeft} minutes left: ${item.activity_name}`,
              body: `${item.guest_name} is nearing the end of this activity.`
            }
          ];
        }
        return [];
      });
      bridge.syncActivityAlarms(JSON.stringify(alarms));
    };
    syncNativeAlarms();
    window.addEventListener("lh:native-alarm-ready", syncNativeAlarms);
    return () => window.removeEventListener("lh:native-alarm-ready", syncNativeAlarms);
  }, [alarmsEnabled, data]);

  const filteredItems = useMemo(() => {
    const cleanQuery = query.trim().toLowerCase();
    return (data?.scheduledItems || []).filter((item) => {
      const matchesName = !cleanQuery || item.guest_name.toLowerCase().includes(cleanQuery);
      const matchesActivity =
        activityFilter === "all" || String(item.activity_id) === String(activityFilter);
      return matchesName && matchesActivity;
    });
  }, [activityFilter, data, query]);

  const timedItems = useMemo(() => filteredItems.filter((item) => item.is_timed), [filteredItems]);
  const untimedItems = useMemo(
    () => filteredItems.filter((item) => !item.is_timed),
    [filteredItems]
  );
  const calendar = useMemo(
    () => buildCalendar(timedItems, data?.settings),
    [data?.settings, timedItems]
  );
  const timedActivities = useMemo(() => {
    if (!data) return [];
    const matchingIds = new Set(timedItems.map((item) => Number(item.activity_id)));
    return data.activities.filter((activity) => {
      if (!activity.active || !activity.time_limit_enabled) return false;
      if (activityFilter !== "all" && String(activity.id) !== String(activityFilter)) return false;
      return !query.trim() || matchingIds.has(Number(activity.id));
    });
  }, [activityFilter, data, query, timedItems]);
  const itemsByActivity = useMemo(
    () =>
      timedItems.reduce((acc, item) => {
        const key = Number(item.activity_id);
        if (!acc[key]) acc[key] = [];
        acc[key].push(item);
        return acc;
      }, {}),
    [timedItems]
  );
  const staffActionItems = useMemo(
    () => getStaffActionItems(data?.scheduledItems || [], clockNow),
    [clockNow, data?.scheduledItems]
  );

  async function enableAlarms() {
    setAlarmsEnabled(true);
    localStorage.setItem("lh-staff-timer-alerts", "on");
    window.LHCheckIn?.enableActivityAlarms?.();
    if ("Notification" in window && Notification.permission === "default") {
      await Notification.requestPermission();
    }
    playAlarmTone(0.04);
    setMessage(
      "Staff alerts are on. Keep this dashboard open on iPhone or iPad; the Android app also schedules system reminders."
    );
  }

  function disableAlarms() {
    setAlarmsEnabled(false);
    localStorage.removeItem("lh-staff-timer-alerts");
    setAlerts([]);
    stopAlarmFeedback();
    dismissAllActivityNotifications();
    window.LHCheckIn?.cancelAllActivityAlarms?.();
    nativeAlarmSetupRequested.current = false;
    setMessage("Staff alerts are off for this device.");
  }

  function testAlarm() {
    const testId = `test-${Date.now()}`;
    const testAlert = {
      id: testId,
      guestName: "Test guest",
      activityName: "Timer alarm test",
      minutesLeft: 5,
      notificationTag: `activity-alarm-${testId}`,
      nativeAlarmId: "test"
    };
    setAlerts((current) => [testAlert, ...current].slice(0, 4));
    showActivityNotification(testAlert);
    window.LHCheckIn?.testActivityAlarm?.();
    setMessage("Test alarm started. Press Stop alarm to silence it.");
  }

  function dismissAlarm(alert) {
    dismissedAlarmItems.current.add(alert.id);
    alertedItems.current.add(alert.id);
    setAlerts((current) => current.filter((item) => item.id !== alert.id));
    stopAlarmFeedback();
    dismissDeviceNotification(alert.notificationTag);
    window.LHCheckIn?.dismissActivityAlarm?.(alert.nativeAlarmId);
    setMessage(`${alert.activityName} alarm stopped.`);
  }

  async function updateStatus(id, status) {
    setMessage("");
    try {
      await api.updateStatus(staffToken, id, status);
      if (status === "In Progress") {
        alertedItems.current.delete(Number(id));
        dismissedAlarmItems.current.delete(Number(id));
      } else {
        const activeAlert = alerts.find((alert) => Number(alert.id) === Number(id));
        if (activeAlert) dismissAlarm(activeAlert);
      }
    } catch (err) {
      setMessage(err.message);
    }
  }

  async function moveItem(id, direction) {
    setMessage("");
    try {
      await api.moveItem(staffToken, id, direction);
    } catch (err) {
      setMessage(err.message);
    }
  }

  async function rescheduleItem(id, targetStart) {
    setMessage("");
    try {
      await api.rescheduleItem(staffToken, id, targetStart);
    } catch (err) {
      setMessage(err.message);
    }
  }

  async function clearGuest(id) {
    if (!window.confirm("Clear this guest from the active dashboard?")) return;
    try {
      await api.clearCheckIn(staffToken, id);
    } catch (err) {
      setMessage(err.message);
    }
  }

  async function moveWithinGuest(checkIn, itemId, direction) {
    const ids = checkIn.items.filter((item) => item.is_timed).map((item) => item.id);
    const index = ids.indexOf(itemId);
    const nextIndex = direction === "up" ? index - 1 : index + 1;
    if (nextIndex < 0 || nextIndex >= ids.length) return;
    const reordered = [...ids];
    [reordered[index], reordered[nextIndex]] = [reordered[nextIndex], reordered[index]];
    try {
      await api.reorderCheckIn(staffToken, checkIn.id, reordered);
    } catch (err) {
      setMessage(err.message);
    }
  }

  async function resetForNewDay(event) {
    event.preventDefault();
    if (!window.confirm("Start a new day and clear all active guest check-ins?")) return;
    try {
      const { token } = await api.adminLogin(resetPin);
      setData(await api.resetDay(token, false));
      setShowReset(false);
      setResetPin("");
      setMessage("New day started. Active guest check-ins were cleared.");
    } catch (err) {
      setMessage(err.message);
    }
  }

  if (!data) return <div className="page-status">Loading dashboard...</div>;

  return (
    <section className="dashboard-page">
      <div className="page-heading compact">
        <div>
          <h1>Staff Dashboard</h1>
          <p>Today&apos;s services organized by guest name, activity, time, and status.</p>
        </div>
        <div className="dashboard-heading-actions">
          <div className="dashboard-alarm-actions">
            <button
              className="secondary-button"
              onClick={alarmsEnabled ? disableAlarms : enableAlarms}
            >
              {alarmsEnabled ? <BellRing size={18} /> : <Bell size={18} />}
              {alarmsEnabled ? "Staff alerts on" : "Turn on staff alerts"}
            </button>
            {alarmsEnabled ? (
              <button className="secondary-button" onClick={testAlarm}>
                <Bell size={18} />
                Test alarm
              </button>
            ) : null}
          </div>
          <button className="secondary-button" onClick={() => setShowReset((value) => !value)}>
            <RotateCcw size={18} />
            New day reset
          </button>
        </div>
      </div>

      {alerts.length ? (
        <div className="activity-alert-stack" aria-live="assertive">
          {alerts.map((alert) => (
            <div className="activity-alert" key={alert.id}>
              <BellRing size={22} />
              <div>
                <strong>
                  {alert.minutesLeft} minutes left: {alert.activityName}
                </strong>
                <span>{alert.guestName} is nearing the end of this activity.</span>
              </div>
              <button
                className="stop-alarm-button"
                onClick={() => dismissAlarm(alert)}
                aria-label={`Stop ${alert.activityName} alarm`}
              >
                <X size={18} />
                Stop alarm
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <StaffActionCenter items={staffActionItems} nowMs={clockNow} onStatus={updateStatus} />

      <div className="mobile-dashboard-switch" aria-label="Phone dashboard sections">
        <button
          className={mobilePanel === "overview" ? "is-active" : ""}
          onClick={() => setMobilePanel("overview")}
        >
          <LayoutDashboard size={18} />
          Overview
        </button>
        <button
          className={mobilePanel === "calendar" ? "is-active" : ""}
          onClick={() => setMobilePanel("calendar")}
        >
          <CalendarDays size={18} />
          Active Calendar
        </button>
      </div>

      {showReset ? (
        <form className="reset-panel" onSubmit={resetForNewDay}>
          <strong>Admin confirmation required</strong>
          <p>Starting a new day clears active guest check-ins and today&apos;s live totals.</p>
          <label>
            Admin PIN
            <input
              type="password"
              value={resetPin}
              onChange={(event) => setResetPin(event.target.value)}
              inputMode="numeric"
            />
          </label>
          <button className="danger-button">Start new day</button>
        </form>
      ) : null}

      {message ? <p className="notice-message">{message}</p> : null}

      <div
        className={`dashboard-overview-section ${
          mobilePanel === "calendar" ? "dashboard-phone-hidden" : ""
        }`}
      >
        <div className="dashboard-summary">
          <Summary label="Active guests" value={data.totals.activeGuests.length} />
          <Summary label="Guests checked in" value={data.totals.guestsCheckedIn} />
          <Summary label="Completed" value={data.totals.completedActivities} />
          <Summary label="Skipped" value={data.totals.skippedActivities} />
        </div>
        <UntimedQueue
          data={data}
          items={untimedItems}
          onClearGuest={clearGuest}
          onStatus={updateStatus}
        />
      </div>

      <div
        className={`dashboard-calendar-section ${
          mobilePanel === "overview" ? "dashboard-phone-hidden" : ""
        }`}
      >
        <div className="dashboard-controls">
          <label className="control-field">
            <Search size={18} />
            <input
              placeholder="Search guest name"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <label className="control-field">
            <Filter size={18} />
            <select
              value={activityFilter}
              onChange={(event) => setActivityFilter(event.target.value)}
            >
              <option value="all">All activities</option>
              {data.activities
                .filter((activity) => activity.active)
                .map((activity) => (
                  <option key={activity.id} value={activity.id}>
                    {activity.name}
                  </option>
                ))}
            </select>
          </label>
          <div className="connection-note">
            <span className="live-dot" />
            Secure live updates
          </div>
        </div>

        <section className="day-calendar-panel" aria-label="Daily activity calendar">
          <div className="calendar-title-row">
            <div>
              <h2>
                <CalendarDays size={24} />
                Today&apos;s Timed Activity Calendar
              </h2>
              <p>Timed services are placed into open time blocks after each guest checks in.</p>
            </div>
            <span className="calendar-range">
              {formatTime(calendar.start)} - {formatTime(calendar.end)}
            </span>
          </div>

          {timedActivities.length === 0 ? (
            <div className="empty-state">
              <CheckCircle2 size={32} />
              <strong>No matching timed activities.</strong>
              <span>Untimed requests remain visible in the service queue.</span>
            </div>
          ) : (
            <>
              <div className="mobile-schedule-list">
                {timedActivities.map((activity) => (
                  <section className="mobile-activity-group" key={activity.id}>
                    <ActivityLaneHeading activity={activity} />
                    {(itemsByActivity[activity.id] || []).map((item) => (
                      <MobileScheduleCard
                        calendarStart={calendar.start}
                        checkIn={findCheckIn(data, item.check_in_id)}
                        item={item}
                        nowMs={clockNow}
                        key={item.id}
                        onClearGuest={clearGuest}
                        onMoveItem={moveItem}
                        onReorder={moveWithinGuest}
                        onReschedule={rescheduleItem}
                        onStatus={updateStatus}
                      />
                    ))}
                  </section>
                ))}
              </div>
              <div className="calendar-scroll">
                <div
                  className="activity-calendar"
                  style={{
                    "--calendar-height": `${calendar.height}px`,
                    "--lane-count": timedActivities.length
                  }}
                >
                  <div className="time-gutter">
                    <div className="lane-header time-header">Time</div>
                    <div className="time-grid">
                      {calendar.ticks.map((tick) => (
                        <div className="time-tick" key={tick.value} style={{ top: tick.top }}>
                          {tick.label}
                        </div>
                      ))}
                    </div>
                  </div>
                  {timedActivities.map((activity) => (
                    <section className="activity-lane" key={activity.id}>
                      <div className="lane-header">
                        <ActivityLaneHeading activity={activity} />
                      </div>
                      <div className="lane-body">
                        {calendar.ticks.map((tick) => (
                          <div
                            className="calendar-line"
                            key={`${activity.id}-${tick.value}`}
                            style={{ top: tick.top }}
                          />
                        ))}
                        {(itemsByActivity[activity.id] || []).map((item) => (
                          <CalendarBlock
                            calendarStart={calendar.start}
                            checkIn={findCheckIn(data, item.check_in_id)}
                            height={
                              minutesBetween(item.scheduled_start, item.scheduled_end) *
                              PIXELS_PER_MINUTE
                            }
                            item={item}
                            nowMs={clockNow}
                            key={item.id}
                            onClearGuest={clearGuest}
                            onMoveItem={moveItem}
                            onReorder={moveWithinGuest}
                            onReschedule={rescheduleItem}
                            onStatus={updateStatus}
                            top={
                              minutesBetween(calendar.start, item.scheduled_start) *
                              PIXELS_PER_MINUTE
                            }
                          />
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </section>
  );
}

function StaffActionCenter({ items, nowMs, onStatus }) {
  const inProgressCount = items.filter((item) => item.status === "In Progress").length;
  return (
    <section className="staff-action-center" aria-label="Activities needing staff attention">
      <div className="staff-action-heading">
        <div>
          <span className="staff-action-eyebrow">
            <BellRing size={17} />
            Staff Action Center
          </span>
          <h2>Who needs attention next</h2>
          <p>Call the guest when their service is ready, then update their status here.</p>
        </div>
        <span className="staff-action-count">
          {items.length} ready
          {inProgressCount ? ` / ${inProgressCount} in progress` : ""}
        </span>
      </div>
      {items.length === 0 ? (
        <div className="staff-action-empty">
          <CheckCircle2 size={22} />
          No activity needs action right now.
        </div>
      ) : (
        <div className="staff-action-list">
          {items.map((item) => (
            <article className="staff-action-card" key={item.id}>
              <div className="staff-action-person">
                <strong>
                  <DailyPersonNumber item={item} />
                  {item.guest_name}
                </strong>
                <span>
                  <MapPin size={15} />
                  {item.activity_name}
                </span>
              </div>
              <div className="staff-action-time">
                <strong>{describeActionTiming(item, nowMs)}</strong>
                <div className="staff-action-window">
                  <span>
                    <Clock3 size={15} />
                    Starts {formatTime(item.scheduled_start)}
                  </span>
                  <span>Ends {formatTime(item.scheduled_end)}</span>
                </div>
              </div>
              <div className="staff-action-buttons" aria-label={`Update ${item.guest_name}`}>
                <button
                  className={item.status === "Waiting" ? "is-active" : ""}
                  onClick={() => onStatus(item.id, "Waiting")}
                >
                  Waiting
                </button>
                <button
                  className={item.status === "In Progress" ? "is-active is-start" : "is-start"}
                  onClick={() => onStatus(item.id, "In Progress")}
                >
                  Start
                </button>
                <button className="is-complete" onClick={() => onStatus(item.id, "Completed")}>
                  Complete
                </button>
                <button onClick={() => onStatus(item.id, "Skipped")}>Skip</button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function UntimedQueue({ data, items, onClearGuest, onStatus }) {
  return (
    <section className="untimed-queue">
      <div className="untimed-queue-heading">
        <div>
          <h2>Untimed Service Queue</h2>
          <p>These services do not use calendar time. Staff can work through them as available.</p>
        </div>
        <span>{items.length} waiting or active</span>
      </div>
      {items.length === 0 ? (
        <div className="mobile-open-note">No untimed requests right now.</div>
      ) : (
        <div className="untimed-queue-grid">
          {items.map((item) => {
            const checkIn = findCheckIn(data, item.check_in_id);
            return (
              <article className="untimed-request-card" key={item.id}>
                <div>
                  <strong>
                    <DailyPersonNumber item={item} />
                    {item.guest_name}
                  </strong>
                  <span>{item.activity_name}</span>
                </div>
                <span
                  className={`status-badge status-${item.status
                    .replaceAll(" ", "-")
                    .toLowerCase()}`}
                >
                  {item.status}
                </span>
                <div className="mobile-status-controls">
                  {STATUSES.map((status) => (
                    <button
                      key={status}
                      className={item.status === status ? "is-active" : ""}
                      onClick={() => onStatus(item.id, status)}
                    >
                      {status}
                    </button>
                  ))}
                </div>
                <button
                  className="mobile-clear-button"
                  disabled={!checkIn}
                  onClick={() => onClearGuest(checkIn.id)}
                >
                  <Trash2 size={16} />
                  Clear guest
                </button>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function ActivityLaneHeading({ activity }) {
  return (
    <>
      <strong>{activity.name}</strong>
      <span>
        {activity.duration_minutes} min
        {activity.daily_limit_enabled
          ? ` / ${activity.daily_used}/${activity.daily_limit} today`
          : ""}
        {activity.alarm_enabled ? ` / timer alert at ${activity.alarm_minutes_before} min` : ""}
      </span>
    </>
  );
}

function Summary({ label, value }) {
  return (
    <div className="summary-card">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function DailyPersonNumber({ item }) {
  if (!item.daily_number) return null;
  return (
    <span className="daily-person-number" title={`Person ${item.daily_number} checked in today`}>
      {item.daily_number}
    </span>
  );
}

function GuestNameBadge({ item }) {
  return (
    <span className="guest-name-badge">
      <DailyPersonNumber item={item} />
      <span>{item.guest_name}</span>
    </span>
  );
}

function MobileScheduleCard(props) {
  const { item, nowMs } = props;
  return (
    <article
      className={`mobile-schedule-card status-border-${item.status
        .replaceAll(" ", "-")
        .toLowerCase()}`}
    >
      <div className="mobile-card-head">
        <GuestNameBadge item={item} />
        <span className={`status-badge status-${item.status.replaceAll(" ", "-").toLowerCase()}`}>
          {item.status}
        </span>
      </div>
      <strong className="mobile-card-activity-name">{item.activity_name}</strong>
      <span className="calendar-time">
        {formatTime(item.scheduled_start)} - {formatTime(item.scheduled_end)}
      </span>
      <ActivityTimer item={item} nowMs={nowMs} />
      <details className="mobile-card-details">
        <summary>View details and options</summary>
        <ScheduleControls {...props} />
      </details>
    </article>
  );
}

function CalendarBlock(props) {
  const { calendarStart, checkIn, height, item, nowMs, onReschedule, top } = props;
  const [drag, setDrag] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const durationClass = height < 32 ? "is-tiny" : height < 64 ? "is-short" : "";

  function handlePointerDown(event) {
    if (event.target.closest("button, input, select, textarea, a")) return;
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({
      offset: event.clientY - rect.top,
      moved: false,
      pointerId: event.pointerId,
      startY: event.clientY,
      y: event.clientY
    });
  }

  function handlePointerMove(event) {
    if (!drag || drag.pointerId !== event.pointerId) return;
    setDrag((current) => ({
      ...current,
      moved: current.moved || Math.abs(event.clientY - current.startY) > 8,
      y: event.clientY
    }));
  }

  function handlePointerUp(event) {
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    if (!drag.moved) {
      setDrag(null);
      setExpanded((current) => !current);
      return;
    }
    const lane = event.currentTarget.closest(".lane-body");
    if (lane) {
      const laneRect = lane.getBoundingClientRect();
      const proposedTop = Math.max(0, event.clientY - laneRect.top - drag.offset);
      const minutes = Math.round(proposedTop / PIXELS_PER_MINUTE / 5) * 5;
      onReschedule(item.id, new Date(calendarStart.getTime() + minutes * 60 * 1000).toISOString());
    }
    setDrag(null);
  }

  return (
    <article
      className={`calendar-block ${expanded ? "is-open is-expanded" : ""} ${
        drag ? "is-dragging" : ""
      } ${durationClass} status-border-${item.status.replaceAll(" ", "-").toLowerCase()}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      role="button"
      style={{
        top,
        height,
        transform: drag ? `translateY(${drag.y - drag.startY}px)` : undefined
      }}
      tabIndex={0}
      aria-label={`${item.guest_name}, ${item.activity_name}, ${item.status}, ${formatTime(
        item.scheduled_start
      )} to ${formatTime(item.scheduled_end)}`}
    >
      <div className="calendar-block-summary">
        <div className="calendar-block-head">
          <GuestNameBadge item={item} />
          <span className={`status-badge status-${item.status.replaceAll(" ", "-").toLowerCase()}`}>
            {item.status}
          </span>
        </div>
        <strong className="calendar-block-activity">{item.activity_name}</strong>
        <span className="calendar-time">
          {formatTime(item.scheduled_start)} - {formatTime(item.scheduled_end)}
        </span>
        <ActivityTimer item={item} nowMs={nowMs} />
      </div>
      <div className="calendar-block-details">
        <ScheduleControls {...props} checkIn={checkIn} />
      </div>
    </article>
  );
}

function ActivityTimer({ item, nowMs }) {
  if (!item.alarm_enabled || item.status !== "In Progress" || !item.scheduled_end) return null;
  const secondsLeft = Math.max(
    0,
    Math.ceil((new Date(item.scheduled_end).getTime() - nowMs) / 1000)
  );
  const minutes = Math.floor(secondsLeft / 60);
  const seconds = String(secondsLeft % 60).padStart(2, "0");
  const warning = secondsLeft <= Number(item.alarm_minutes_before || 5) * 60;

  return (
    <span className={`activity-timer ${warning ? "is-warning" : ""}`}>
      <BellRing size={15} />
      {minutes}:{seconds} remaining
    </span>
  );
}

function ScheduleControls({
  calendarStart,
  checkIn,
  item,
  onClearGuest,
  onMoveItem,
  onReorder,
  onReschedule,
  onStatus
}) {
  const timedIds =
    checkIn?.items?.filter((candidate) => candidate.is_timed).map((item) => item.id) || [];
  const itemIndex = timedIds.indexOf(item.id);
  const [manualTime, setManualTime] = useState(toTimeInputValue(item.scheduled_start));

  useEffect(() => setManualTime(toTimeInputValue(item.scheduled_start)), [item.scheduled_start]);

  function handleManualMove(event) {
    event.preventDefault();
    onReschedule(item.id, localTimeOnSameDay(calendarStart, manualTime).toISOString());
  }

  return (
    <div className="mobile-card-detail-body">
      <div className="mobile-move-controls">
        <button onClick={() => onMoveItem(item.id, "earlier")}>
          <ArrowUp size={16} /> Earlier
        </button>
        <button onClick={() => onMoveItem(item.id, "later")}>
          <ArrowDown size={16} /> Later
        </button>
        <button
          disabled={!checkIn || itemIndex <= 0}
          onClick={() => onReorder(checkIn, item.id, "up")}
        >
          <ArrowUp size={16} /> For guest
        </button>
        <button
          disabled={!checkIn || itemIndex < 0 || itemIndex >= timedIds.length - 1}
          onClick={() => onReorder(checkIn, item.id, "down")}
        >
          <ArrowDown size={16} /> For guest
        </button>
      </div>
      <form className="mobile-time-move" onSubmit={handleManualMove}>
        <label>
          Move to time
          <input
            aria-label={`Move ${item.guest_name} to time`}
            value={manualTime}
            onChange={(event) => setManualTime(event.target.value)}
            type="time"
          />
        </label>
        <button>Move</button>
      </form>
      <div className="mobile-status-controls">
        {STATUSES.map((status) => (
          <button
            key={status}
            className={item.status === status ? "is-active" : ""}
            onClick={() => onStatus(item.id, status)}
          >
            {status}
          </button>
        ))}
      </div>
      <button
        className="mobile-clear-button"
        disabled={!checkIn}
        onClick={() => onClearGuest(checkIn.id)}
      >
        <Trash2 size={16} /> Clear guest
      </button>
    </div>
  );
}

function findCheckIn(data, checkInId) {
  return data.activeCheckIns.find((candidate) => Number(candidate.id) === Number(checkInId));
}

function playAlarmTone(volume = 0.16) {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const context = getAlarmAudioContext(AudioContext);
    context.resume?.();
    [0, 0.32, 0.64].forEach((delay, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const start = context.currentTime + delay;
      oscillator.frequency.value = index === 1 ? 740 : 920;
      gain.gain.setValueAtTime(volume, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.24);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.25);
    });
  } catch {
    // In-app and vibration alerts still work when audio is unavailable.
  }
}

let alarmAudioContext = null;
const activeDeviceNotifications = new Map();

function getAlarmAudioContext(AudioContext) {
  if (!alarmAudioContext || alarmAudioContext.state === "closed") {
    alarmAudioContext = new AudioContext();
  }
  return alarmAudioContext;
}

function stopAlarmFeedback() {
  navigator.vibrate?.(0);
  if (alarmAudioContext && alarmAudioContext.state !== "closed") {
    alarmAudioContext.close().catch(() => {});
  }
  alarmAudioContext = null;
}

async function dismissDeviceNotification(tag) {
  if (!tag) return;
  const notification = activeDeviceNotifications.get(tag);
  notification?.close?.();
  activeDeviceNotifications.delete(tag);
  if (!("serviceWorker" in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    const notifications = await registration.getNotifications({ tag });
    notifications.forEach((item) => item.close());
  } catch {
    // The visible dashboard alarm is already stopped.
  }
}

function dismissAllActivityNotifications() {
  for (const [tag, notification] of activeDeviceNotifications) {
    if (tag.startsWith("activity-")) notification.close?.();
  }
  activeDeviceNotifications.clear();
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.ready
    .then((registration) => registration.getNotifications())
    .then((notifications) => {
      notifications
        .filter((notification) => notification.tag.startsWith("activity-"))
        .forEach((notification) => notification.close());
    })
    .catch(() => {});
}

async function showActivityNotification(alert) {
  return showDeviceNotification({
    title: `${alert.minutesLeft} minutes left: ${alert.activityName}`,
    body: `${alert.guestName} is nearing the end of this activity.`,
    tag: alert.notificationTag || `activity-alarm-${alert.id}`,
    requireInteraction: true
  });
}

async function showStartingSoonNotification(item) {
  return showDeviceNotification({
    title: `${item.guest_name} is ready soon`,
    body: `${item.activity_name} starts at ${formatTime(item.scheduled_start)}. Please call the guest.`,
    tag: `activity-start-${item.id}`,
    requireInteraction: true
  });
}

async function showDeviceNotification({ title, body, tag, requireInteraction = false }) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const options = {
    body,
    icon: "/icons/lh-icon-192.png",
    badge: "/icons/lh-icon-192.png",
    tag,
    renotify: true,
    requireInteraction,
    vibrate: [500, 180, 500]
  };
  try {
    if ("serviceWorker" in navigator) {
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification(title, options);
      return;
    }
    const notification = new Notification(title, options);
    activeDeviceNotifications.set(tag, notification);
    notification.onclose = () => activeDeviceNotifications.delete(tag);
  } catch {
    try {
      const notification = new Notification(title, options);
      activeDeviceNotifications.set(tag, notification);
      notification.onclose = () => activeDeviceNotifications.delete(tag);
    } catch {
      // The visible repeating alert remains available when notifications are blocked.
    }
  }
}

function buildCalendar(items, settings = {}) {
  const now = new Date();
  const { start: fallbackStart, end: fallbackEnd } = getWorkdayBoundsForDisplay(now, settings);
  if (!items.length) return makeCalendarRange(fallbackStart, fallbackEnd);
  const starts = items.map((item) => new Date(item.scheduled_start));
  const ends = items.map((item) => new Date(item.scheduled_end));
  const earliest = floorToHour(new Date(Math.min(...starts.map((date) => date.getTime()))));
  const latest = ceilToHour(new Date(Math.max(...ends.map((date) => date.getTime()))));
  return makeCalendarRange(
    earliest >= fallbackStart && latest <= fallbackEnd ? fallbackStart : earliest,
    earliest >= fallbackStart && latest <= fallbackEnd ? fallbackEnd : latest
  );
}

function getWorkdayBoundsForDisplay(referenceDate, settings = {}) {
  const startParts = parseTimeValue(settings.workday_start || DEFAULT_WORKDAY_START);
  const endParts = parseTimeValue(settings.workday_end || DEFAULT_WORKDAY_END);
  const start = new Date(referenceDate);
  start.setHours(startParts.hours, startParts.minutes, 0, 0);
  const end = new Date(referenceDate);
  end.setHours(endParts.hours, endParts.minutes, 0, 0);
  if (end <= start) end.setDate(end.getDate() + 1);
  return { start, end };
}

function parseTimeValue(value) {
  const match = String(value).match(/^(\d{1,2}):(\d{2})$/);
  return match
    ? {
        hours: Math.min(23, Math.max(0, Number(match[1]))),
        minutes: Math.min(59, Math.max(0, Number(match[2])))
      }
    : { hours: 8, minutes: 0 };
}

function makeCalendarRange(start, end) {
  const duration = Math.max(60, minutesBetween(start, end));
  const ticks = [];
  const cursor = floorToHour(start);
  while (cursor <= end) {
    ticks.push({
      label: formatTime(cursor),
      top: minutesBetween(start, cursor) * PIXELS_PER_MINUTE,
      value: cursor.toISOString()
    });
    cursor.setMinutes(cursor.getMinutes() + 60);
  }
  return { start, end, height: duration * PIXELS_PER_MINUTE, ticks };
}

function toTimeInputValue(value) {
  const date = new Date(value);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(
    2,
    "0"
  )}`;
}

function localTimeOnSameDay(referenceValue, timeValue) {
  const [hours, minutes] = String(timeValue || "00:00")
    .split(":")
    .map(Number);
  const next = new Date(referenceValue);
  next.setHours(hours || 0, minutes || 0, 0, 0);
  return next;
}

function floorToHour(date) {
  const next = new Date(date);
  next.setMinutes(0, 0, 0);
  return next;
}

function ceilToHour(date) {
  const next = floorToHour(date);
  if (next < date) next.setHours(next.getHours() + 1);
  return next;
}
