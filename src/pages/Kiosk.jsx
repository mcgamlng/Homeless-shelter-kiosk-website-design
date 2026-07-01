import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronLeft, HandHeart, Volume2, VolumeX } from "lucide-react";
import { api } from "../api.js";
import { ActivityIcon } from "../icons.jsx";
import {
  formatActivityDuration,
  formatActivityDurationForSpeech,
  formatActivityClock,
  languageOptions,
  translateActivityName,
  translations
} from "../i18n.js";
import { chooseSpeechVoice, preferredSpeechLanguage, speechProfile } from "../speechVoices.js";
import { getCustomizedKioskText, getKioskCssVariables } from "../../shared/kioskCustomization.js";

const STEPS = {
  WELCOME: "welcome",
  IDENTITY: "identity",
  LANGUAGE: "language",
  ACTIVITIES: "activities",
  CONFIRMATION: "confirmation"
};
const DEFAULT_IDENTITY = { firstName: "", lastName: "" };
const CONFIRMATION_AUTO_RESET_SECONDS = 10;

export default function Kiosk({ settings: shellSettings = null }) {
  const [step, setStep] = useState(STEPS.WELCOME);
  const [language, setLanguage] = useState("en");
  const [activities, setActivities] = useState([]);
  const [settings, setSettings] = useState(shellSettings);
  const [identity, setIdentity] = useState(DEFAULT_IDENTITY);
  const [selectedIds, setSelectedIds] = useState([]);
  const [confirmation, setConfirmation] = useState(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [checkingIdentity, setCheckingIdentity] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [readoutMessage, setReadoutMessage] = useState("");
  const [autoResetSeconds, setAutoResetSeconds] = useState(CONFIRMATION_AUTO_RESET_SECONDS);
  const speechTimerRef = useRef(null);
  const speechRunRef = useRef(0);
  const speechVoicesRef = useRef([]);
  const speechAudioRef = useRef(null);

  const baseTranslations = { ...translations.en, ...(translations[language] || {}) };
  const t = useMemo(
    () => getCustomizedKioskText(baseTranslations, settings || {}, language),
    [baseTranslations, settings, language]
  );
  const kioskThemeStyle = useMemo(() => getKioskCssVariables(settings || {}), [settings]);
  const selectedActivities = useMemo(
    () => activities.filter((activity) => selectedIds.includes(activity.id)),
    [activities, selectedIds]
  );

  useEffect(() => {
    Promise.all([api.getActivities(), api.getSettings()])
      .then(([nextActivities, nextSettings]) => {
        setActivities(nextActivities);
        setSettings(nextSettings);
      })
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    if (shellSettings) setSettings(shellSettings);
  }, [shellSettings]);

  useEffect(() => () => cancelSpeech(), []);

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return undefined;
    const loadVoices = () => {
      speechVoicesRef.current = window.speechSynthesis.getVoices();
    };
    loadVoices();
    window.speechSynthesis.addEventListener?.("voiceschanged", loadVoices);
    window.speechSynthesis.onvoiceschanged = loadVoices;
    return () => {
      window.speechSynthesis.removeEventListener?.("voiceschanged", loadVoices);
      if (window.speechSynthesis.onvoiceschanged === loadVoices) {
        window.speechSynthesis.onvoiceschanged = null;
      }
    };
  }, []);

  useEffect(() => {
    stopReadout();
    window.scrollTo({ top: 0, left: 0 });
  }, [step, language]);

  useEffect(() => {
    if (step !== STEPS.CONFIRMATION || !confirmation) {
      setAutoResetSeconds(CONFIRMATION_AUTO_RESET_SECONDS);
      return undefined;
    }
    const deadline = Date.now() + CONFIRMATION_AUTO_RESET_SECONDS * 1000;
    const timer = window.setInterval(() => {
      const secondsLeft = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setAutoResetSeconds(secondsLeft);
      if (secondsLeft === 0) {
        window.clearInterval(timer);
        resetFlow();
      }
    }, 250);
    return () => window.clearInterval(timer);
  }, [step, confirmation]);

  function resetFlow() {
    setStep(STEPS.WELCOME);
    setLanguage("en");
    setIdentity(DEFAULT_IDENTITY);
    setSelectedIds([]);
    setConfirmation(null);
    setError("");
    setSubmitting(false);
    setCheckingIdentity(false);
    setReadoutMessage("");
    setAutoResetSeconds(CONFIRMATION_AUTO_RESET_SECONDS);
  }

  function cancelSpeech() {
    speechRunRef.current += 1;
    if (speechTimerRef.current) window.clearTimeout(speechTimerRef.current);
    speechTimerRef.current = null;
    if (speechAudioRef.current) {
      speechAudioRef.current.pause();
      speechAudioRef.current.removeAttribute("src");
      speechAudioRef.current.load();
      speechAudioRef.current = null;
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  }

  function stopReadout(message = "") {
    cancelSpeech();
    setSpeaking(false);
    setReadoutMessage(message);
  }

  async function readCurrentScreen() {
    if (typeof window === "undefined") {
      setReadoutMessage(t.readoutUnavailable);
      return;
    }
    if (speaking) {
      stopReadout(t.readoutStopped);
      return;
    }
    const segments = buildReadoutSegments();
    if (segments.length === 0) return;
    const pauseMs = step === STEPS.ACTIVITIES ? 1000 : 250;
    cancelSpeech();
    const runId = speechRunRef.current + 1;
    speechRunRef.current = runId;
    setSpeaking(true);
    setReadoutMessage(t.readingNow);

    if (language === "hmn") {
      if (!("Audio" in window)) {
        stopReadout(t.readoutUnavailable);
        return;
      }
      const queue = segments.map((segment) => ({
        url: `/api/speech/hmong?text=${encodeURIComponent(segment)}`,
        pauseAfter: pauseMs
      }));
      playAudioQueue(queue, runId, 0, 1);
      return;
    }
    if (language === "es") {
      if (!("Audio" in window)) {
        stopReadout(t.readoutUnavailable);
        return;
      }
      const queue = segments.map((segment) => ({
        url: `/api/speech/spanish?text=${encodeURIComponent(segment)}`,
        pauseAfter: pauseMs
      }));
      playAudioQueue(queue, runId, 0, 1);
      return;
    }
    if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
      stopReadout(t.readoutUnavailable);
      return;
    }
    await refreshSpeechVoices();
    const voice = chooseSpeechVoice(speechVoicesRef.current, language);
    speakSegments(segments, runId, pauseMs, voice);
  }

  function playAudioQueue(queue, runId, index, playbackRate) {
    if (runId !== speechRunRef.current) return;
    if (index >= queue.length) {
      speechAudioRef.current = null;
      setSpeaking(false);
      setReadoutMessage("");
      return;
    }
    const audio = new window.Audio(queue[index].url);
    speechAudioRef.current = audio;
    audio.preload = "auto";
    audio.playbackRate = playbackRate;
    audio.onended = () => {
      if (runId !== speechRunRef.current) return;
      speechAudioRef.current = null;
      speechTimerRef.current = window.setTimeout(
        () => playAudioQueue(queue, runId, index + 1, playbackRate),
        queue[index].pauseAfter
      );
    };
    audio.onerror = () => {
      if (runId !== speechRunRef.current) return;
      speechAudioRef.current = null;
      if (language === "es" && "speechSynthesis" in window) {
        refreshSpeechVoices().then(() => {
          if (runId !== speechRunRef.current) return;
          const fallbackVoice = chooseSpeechVoice(speechVoicesRef.current, language);
          speakSegments(
            buildReadoutSegments(),
            runId,
            step === STEPS.ACTIVITIES ? 1000 : 250,
            fallbackVoice
          );
        });
        return;
      }
      setSpeaking(false);
      setReadoutMessage(language === "hmn" ? t.readoutVoiceMissing : t.readoutUnavailable);
    };
    audio.play().catch(() => {
      if (runId !== speechRunRef.current) return;
      setSpeaking(false);
      setReadoutMessage(t.readoutUnavailable);
    });
  }

  function speakSegments(segments, runId, pauseMs, voice, index = 0) {
    if (runId !== speechRunRef.current) return;
    const utterance = new window.SpeechSynthesisUtterance(segments[index]);
    const profile = speechProfile(language);
    if (voice) utterance.voice = voice;
    utterance.lang = preferredSpeechLanguage(language);
    utterance.rate = profile.rate;
    utterance.pitch = profile.pitch;
    utterance.onend = () => {
      if (runId !== speechRunRef.current) return;
      if (index >= segments.length - 1) {
        setSpeaking(false);
        setReadoutMessage("");
        return;
      }
      speechTimerRef.current = window.setTimeout(
        () => speakSegments(segments, runId, pauseMs, voice, index + 1),
        pauseMs
      );
    };
    utterance.onerror = (event) => {
      if (runId !== speechRunRef.current) return;
      if (event.error === "interrupted" || event.error === "canceled") return;
      setSpeaking(false);
      setReadoutMessage(t.readoutUnavailable);
    };
    try {
      window.speechSynthesis.resume?.();
      window.speechSynthesis.speak(utterance);
    } catch {
      setSpeaking(false);
      setReadoutMessage(t.readoutUnavailable);
    }
  }

  async function refreshSpeechVoices() {
    let voices = window.speechSynthesis.getVoices();
    if (!voices.length) {
      await new Promise((resolve) => window.setTimeout(resolve, 250));
      voices = window.speechSynthesis.getVoices();
    }
    speechVoicesRef.current = voices;
  }

  function buildReadoutSegments() {
    const withError = (text) => (error ? `${text} ${error}` : text);
    if (step === STEPS.WELCOME) {
      return [`${t.welcome}. ${t.kioskPurpose}. ${t.checkInButton}.`];
    }
    if (step === STEPS.IDENTITY) {
      return [withError(`${t.nameEntryTitle}. ${t.nameEntryHelp}. ${t.firstName}. ${t.lastName}.`)];
    }
    if (step === STEPS.LANGUAGE) {
      return [
        `${t.chooseLanguage} ${t.readoutLanguageOptions}: ${languageOptions
          .map((option) => option.label)
          .join(", ")}.`
      ];
    }
    if (step === STEPS.ACTIVITIES) {
      return [
        `${t.needToday}. ${t.chooseSupport}.`,
        ...activities.map((activity) => {
          const timing = activity.time_limit_enabled
            ? formatActivityDurationForSpeech(activity.duration_minutes, language)
            : t.untimed;
          const availability = activity.is_full
            ? t.fullToday
            : activity.is_unavailable
              ? `${t.unavailableNow}. ${
                  activity.availability_window_enabled
                    ? formatAvailabilityWindow(activity, t, language)
                    : ""
                }`
              : activity.daily_limit_enabled
                ? t.spotsLeft.replace("{count}", activity.daily_remaining)
                : "";
          return `${translateActivityName(activity, language)}, ${timing}. ${availability}`;
        }),
        withError(t.continue)
      ];
    }
    if (step === STEPS.CONFIRMATION && confirmation) {
      return [
        `${t.checkedIn}. ${t.staffWillCall}. ${confirmation.items
          .map((item) => translateActivityName(item, language))
          .join(". ")}`
      ];
    }
    return [];
  }

  function beginIdentity() {
    setIdentity(DEFAULT_IDENTITY);
    setError("");
    setStep(STEPS.IDENTITY);
  }

  function updateIdentity(field, value) {
    setIdentity((current) => ({ ...current, [field]: value }));
    setError("");
  }

  async function submitIdentity(event) {
    event.preventDefault();
    if (!identity.firstName.trim() || !identity.lastName.trim()) {
      setError(t.errorFullName);
      return;
    }
    setCheckingIdentity(true);
    setError("");
    try {
      await api.inspectNameCheckIn({ mode: "auto", ...identity });
      setStep(STEPS.LANGUAGE);
    } catch (err) {
      setError(err.message);
    } finally {
      setCheckingIdentity(false);
    }
  }

  function toggleActivity(activity) {
    if (activity.is_full || activity.is_unavailable) return;
    setSelectedIds((current) =>
      current.includes(activity.id)
        ? current.filter((id) => id !== activity.id)
        : [...current, activity.id]
    );
    setError("");
  }

  async function submitCheckIn() {
    if (selectedIds.length === 0) {
      setError(t.errorSelect);
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const data = await api.createCheckIn({
        language,
        activityIds: selectedIds,
        signIn: { mode: "auto", ...identity }
      });
      setConfirmation(data);
      setStep(STEPS.CONFIRMATION);
    } catch (err) {
      setError(err.message);
      setActivities(await api.getActivities());
    } finally {
      setSubmitting(false);
    }
  }

  function goBack() {
    setError("");
    if (step === STEPS.IDENTITY) setStep(STEPS.WELCOME);
    if (step === STEPS.LANGUAGE) setStep(STEPS.IDENTITY);
    if (step === STEPS.ACTIVITIES) setStep(STEPS.LANGUAGE);
  }

  const hasBack = ![STEPS.WELCOME, STEPS.CONFIRMATION].includes(step);

  return (
    <section className={`kiosk-page ${hasBack ? "has-back" : ""}`} style={kioskThemeStyle}>
      <div className={`kiosk-stage ${hasBack ? "has-back" : ""}`}>
        {hasBack ? (
          <button className="ghost-button kiosk-back" onClick={goBack}>
            <ChevronLeft size={22} />
            {t.back}
          </button>
        ) : null}
        <button
          type="button"
          className={`readout-button ${speaking ? "is-speaking" : ""}`}
          onClick={readCurrentScreen}
          aria-label={speaking ? t.stopReading : t.readPage}
        >
          {speaking ? <VolumeX size={24} /> : <Volume2 size={24} />}
          <span className="readout-label">{speaking ? t.stopReading : t.readPage}</span>
        </button>
        {readoutMessage ? <p className="readout-feedback">{readoutMessage}</p> : null}

        <div className={`kiosk-shell ${hasBack ? "has-back" : ""} is-${step}`}>
          {step === STEPS.WELCOME ? (
            <div className="kiosk-center">
              <div className="kiosk-symbol">
                <HandHeart size={58} />
              </div>
              <h1>{t.welcome}</h1>
              <p className="kiosk-lede">{t.kioskPurpose}</p>
              <button className="primary-button kiosk-start" onClick={beginIdentity}>
                <span>{t.checkInButton}</span>
                <small>{t.checkInButtonHelp}</small>
              </button>
            </div>
          ) : null}

          {step === STEPS.IDENTITY ? (
            <div className="kiosk-panel identity-panel">
              <h1>{t.nameEntryTitle}</h1>
              <p>{t.nameEntryHelp}</p>
              <form className="identity-form" onSubmit={submitIdentity}>
                <div className="identity-form-grid">
                  <label>
                    <span>{t.firstName} *</span>
                    <input
                      autoComplete="given-name"
                      value={identity.firstName}
                      onChange={(event) => updateIdentity("firstName", event.target.value)}
                    />
                  </label>
                  <label>
                    <span>{t.lastName} *</span>
                    <input
                      autoComplete="family-name"
                      value={identity.lastName}
                      onChange={(event) => updateIdentity("lastName", event.target.value)}
                    />
                  </label>
                </div>
                {error ? <p className="error-message">{error}</p> : null}
                <button className="primary-button kiosk-next" disabled={checkingIdentity}>
                  {checkingIdentity ? t.checkingSignIn : t.continue}
                </button>
              </form>
            </div>
          ) : null}

          {step === STEPS.LANGUAGE ? (
            <div className="kiosk-panel">
              <h1>{t.chooseLanguage}</h1>
              <div className="language-grid">
                {languageOptions.map((option) => (
                  <button
                    key={option.code}
                    className="choice-button"
                    onClick={() => {
                      setLanguage(option.code);
                      setStep(STEPS.ACTIVITIES);
                    }}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {step === STEPS.ACTIVITIES ? (
            <div className="kiosk-panel wide">
              <h1>{t.needToday}</h1>
              <p>{t.chooseSupport}</p>
              <div className="activity-grid">
                {activities.map((activity) => {
                  const selected = selectedIds.includes(activity.id);
                  const unavailable = activity.is_full || activity.is_unavailable;
                  return (
                    <button
                      key={activity.id}
                      className={`activity-choice ${selected ? "is-selected" : ""} ${
                        unavailable ? "is-full" : ""
                      }`}
                      disabled={unavailable}
                      onClick={() => toggleActivity(activity)}
                    >
                      <ActivityIcon name={activity.icon} className="activity-icon" />
                      <span>{translateActivityName(activity, language)}</span>
                      <small>
                        {activity.time_limit_enabled
                          ? formatActivityDuration(activity.duration_minutes, language)
                          : t.untimed}
                      </small>
                      {activity.daily_limit_enabled ? (
                        <small className="activity-availability">
                          {activity.is_full
                            ? t.fullToday
                            : t.spotsLeft.replace("{count}", activity.daily_remaining)}
                        </small>
                      ) : null}
                      {activity.is_unavailable ? (
                        <small className="activity-availability">{t.unavailableNow}</small>
                      ) : null}
                      {activity.availability_window_enabled ? (
                        <small className="activity-availability">
                          {formatAvailabilityWindow(activity, t, language)}
                        </small>
                      ) : null}
                      {selected ? <Check className="checkmark" size={24} /> : null}
                    </button>
                  );
                })}
              </div>
              {error ? <p className="error-message">{error}</p> : null}
              <button
                className="primary-button kiosk-next"
                disabled={submitting}
                onClick={submitCheckIn}
              >
                {submitting ? t.saving : t.continue}
              </button>
            </div>
          ) : null}

          {step === STEPS.CONFIRMATION && confirmation ? (
            <div className="kiosk-panel confirmation-panel">
              <p className="done-note">{t.checkedIn}</p>
              <div className="guest-name-hero">{confirmation.guest_name}</div>
              <h1>{t.staffWillCall}</h1>
              <div className="confirmation-list">
                {confirmation.items.map((item) => (
                  <div key={item.id}>
                    <strong>{translateActivityName(item, language)}</strong>
                  </div>
                ))}
              </div>
              <button className="primary-button kiosk-start" onClick={resetFlow}>
                {t.finish}
              </button>
              <p className="auto-reset-note">
                {t.autoReturn.replace("{seconds}", autoResetSeconds)}
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function formatAvailabilityWindow(activity, text, language) {
  return text.availableHours
    .replace("{start}", formatActivityClock(activity.availability_start, language))
    .replace("{end}", formatActivityClock(activity.availability_end, language));
}
