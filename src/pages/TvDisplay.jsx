import { useEffect, useMemo, useState } from "react";
import { Clock, Monitor, Radio } from "lucide-react";
import { api } from "../api.js";
import { createTvSocket } from "../socket.js";

const timeFormatter = new Intl.DateTimeFormat([], {
  hour: "numeric",
  minute: "2-digit"
});

function formatTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return timeFormatter.format(date);
}

function formatCountdown(item, now) {
  const start = new Date(item.scheduled_start);
  if (Number.isNaN(start.getTime())) return "";
  const minutes = Math.ceil((start.getTime() - now.getTime()) / 60_000);
  if (minutes <= 0) return "Ready now";
  if (minutes === 1) return "1 minute";
  return `${minutes} minutes`;
}

function formatWindow(item) {
  const start = formatTime(item.scheduled_start);
  const end = formatTime(item.scheduled_end);
  return [start, end].filter(Boolean).join(" - ");
}

export default function TvDisplay() {
  const [tvData, setTvData] = useState(null);
  const [message, setMessage] = useState("Loading TV view...");
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    let active = true;
    api
      .getTv()
      .then((data) => {
        if (!active) return;
        setTvData(data);
        setMessage("");
      })
      .catch((error) => {
        if (active) setMessage(error.message || "TV view could not load.");
      });

    const socket = createTvSocket((data) => {
      setTvData(data);
      setMessage("");
    });
    socket.on("connect_error", () => {
      setMessage("Trying to reconnect to the Listening House server...");
    });
    return () => {
      active = false;
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  const readyItems = useMemo(
    () => (tvData?.upcoming || []).filter((item) => item.state === "ready"),
    [tvData]
  );
  const hasUpcoming = Boolean(tvData?.upcoming?.length);

  return (
    <section className="tv-page" aria-live="polite">
      <header className="tv-hero">
        <div>
          <span className="tv-eyebrow">
            <Monitor size={24} />
            TV Section
          </span>
          <h1>Listening House service screen</h1>
          <p>Guests appear here shortly before it is time for staff to call them.</p>
        </div>
        <div className="tv-clock">
          <Clock size={26} />
          <strong>{timeFormatter.format(now)}</strong>
          <span>Live</span>
        </div>
      </header>

      {message ? (
        <div className="tv-status">
          <Radio size={28} />
          <span>{message}</span>
        </div>
      ) : null}

      {readyItems.length > 0 ? (
        <section className="tv-ready-strip">
          <h2>Ready now</h2>
          <div className="tv-ready-list">
            {readyItems.map((item) => (
              <TvGuestCard
                key={`${item.daily_number}-${item.activity_name}-${item.scheduled_start}-ready`}
                item={item}
                now={now}
              />
            ))}
          </div>
        </section>
      ) : null}

      {!message && !hasUpcoming ? (
        <section className="tv-empty">
          <h2>No one is ready yet</h2>
          <p>
            Names will appear here about {tvData?.lead_minutes || 10} minutes before service time.
          </p>
        </section>
      ) : null}

      <div className="tv-section-grid">
        {(tvData?.activity_sections || []).map((section) => (
          <article className="tv-activity-section" key={section.activity_name}>
            <h2>{section.activity_name}</h2>
            {section.items.length === 0 ? (
              <p className="tv-section-empty">
                No one waiting in the next {tvData.lead_minutes} minutes.
              </p>
            ) : (
              <div className="tv-activity-list">
                {section.items.map((item) => (
                  <TvGuestCard
                    key={`${item.daily_number}-${item.activity_name}-${item.scheduled_start}`}
                    item={item}
                    now={now}
                  />
                ))}
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

function TvGuestCard({ item, now }) {
  return (
    <div className={`tv-guest-card is-${item.state}`}>
      <div className="tv-guest-number">{item.daily_number || "-"}</div>
      <div className="tv-guest-main">
        <strong>{item.guest_display_name}</strong>
        <span>{item.activity_name}</span>
      </div>
      <div className="tv-guest-time">
        <strong>{formatCountdown(item, now)}</strong>
        <span>{formatWindow(item)}</span>
      </div>
    </div>
  );
}
