import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronLeft, Volume2, VolumeX } from "lucide-react";
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
import "../kioskActivityLayout.css";

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
  const lastNameInputRef = useRef(null);

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
      const audio = speechAudioRef.current;
      audio.onended = null;
      audio.onerror = null;
      audio.onabort = null;
      audio.pause();
      audio.removeAttribute("src");
      audio.src = "";
      audio.load();
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

    if (["en", "es", "hmn", "so"].includes(language)) {
      if (!("Audio" in window)) startBrowserSpeechFallback(segments, runId, pauseMs);
      else
        playBestSpeechQueue(segments, runId, pauseMs, language, () =>
          startBrowserSpeechFallback(segments, runId, pauseMs)
        );
      return;
    }

    startBrowserSpeechFallback(segments, runId, pauseMs);
  }

  function speechRouteUrl(route, segment, currentLanguage) {
    return `/api/speech/${route}?${new URLSearchParams({
      language: currentLanguage,
      text: readoutSegmentText(segment)
    }).toString()}`;
  }

  function playNaturalSpeechQueue(segments, runId, pauseMs, currentLanguage, onFailure) {
    const queue = segments.map((segment) => ({
      url: speechRouteUrl("natural", segment, currentLanguage),
      pauseAfter: pauseMs
    }));
    playAudioQueue(queue, runId, 0, 1, onFailure);
  }

  function playBestSpeechQueue(segments, runId, pauseMs, currentLanguage, onFailure) {
    const queue = segments.map((segment) => ({
      url: `/api/speech/best?${new URLSearchParams({
        language: currentLanguage,
        text: readoutSegmentText(segment),
        ...(readoutSegmentKey(segment) ? { key: readoutSegmentKey(segment) } : {})
      }).toString()}`,
      pauseAfter: pauseMs
    }));
    playAudioQueue(queue, runId, 0, 1, onFailure);
  }

  function playCloudSpeechQueue(segments, runId, pauseMs, currentLanguage, onFailure) {
    const queue = segments.map((segment) => ({
      url: speechRouteUrl("cloud", segment, currentLanguage),
      pauseAfter: pauseMs
    }));
    playAudioQueue(queue, runId, 0, 1, onFailure);
  }

  function playLocalSpeechQueue(segments, runId, pauseMs, currentLanguage, onFailure) {
    const queue = segments.map((segment) => ({
      url: speechRouteUrl("local", segment, currentLanguage),
      pauseAfter: pauseMs
    }));
    playAudioQueue(queue, runId, 0, 1, onFailure);
  }

  function playHmongSpeechQueue(segments, runId, pauseMs, onFailure) {
    const queue = segments.map((segment) => ({
      url: `/api/speech/hmong?${new URLSearchParams({
        text: readoutSegmentText(segment),
        ...(readoutSegmentKey(segment) ? { key: readoutSegmentKey(segment) } : {})
      }).toString()}`,
      pauseAfter: pauseMs
    }));
    playAudioQueue(queue, runId, 0, 1, onFailure);
  }

  function playAudioQueue(queue, runId, index, playbackRate, onFailure = null) {
    if (runId !== speechRunRef.current) return;
    if (index >= queue.length) {
      speechAudioRef.current = null;
      setSpeaking(false);
      setReadoutMessage("");
      return;
    }
    if (speechAudioRef.current) {
      speechAudioRef.current.onended = null;
      speechAudioRef.current.onerror = null;
      speechAudioRef.current.pause();
    }
    const audio = new window.Audio(queue[index].url);
    speechAudioRef.current = audio;
    audio.preload = "auto";
    audio.playbackRate = playbackRate;
    audio.onabort = () => {
      if (runId === speechRunRef.current) handleAudioFailure();
    };
    audio.onended = () => {
      if (runId !== speechRunRef.current) return;
      speechAudioRef.current = null;
      speechTimerRef.current = window.setTimeout(
        () => playAudioQueue(queue, runId, index + 1, playbackRate, onFailure),
        queue[index].pauseAfter
      );
    };
    const handleAudioFailure = () => {
      if (runId !== speechRunRef.current) return;
      speechAudioRef.current = null;
      if (onFailure) {
        onFailure();
        return;
      }
      setSpeaking(false);
      setReadoutMessage(language === "hmn" ? t.readoutVoiceMissing : t.readoutUnavailable);
    };
    audio.onerror = handleAudioFailure;
    audio.play().catch(handleAudioFailure);
  }

  async function startBrowserSpeechFallback(segments, runId, pauseMs) {
    if (runId !== speechRunRef.current) return;
    if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
      stopReadout(t.readoutUnavailable);
      return;
    }
    await refreshSpeechVoices();
    if (runId !== speechRunRef.current) return;
    const voice = chooseSpeechVoice(speechVoicesRef.current, language);
    speakSegments(segments, runId, pauseMs, voice);
  }

  function speakSegments(segments, runId, pauseMs, voice, index = 0) {
    if (runId !== speechRunRef.current) return;
    const utterance = new window.SpeechSynthesisUtterance(readoutSegmentText(segments[index]));
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
    const segment = (key, text) => ({ key, text });
    const withError = (key, text) => (error ? { text: `${text} ${error}` } : segment(key, text));
    if (step === STEPS.WELCOME) {
      return [segment("welcome_screen", `${t.welcome}. ${t.kioskPurpose}. ${t.checkInButton}.`)];
    }
    if (step === STEPS.IDENTITY) {
      return [
        withError(
          "identity_screen",
          `${t.nameEntryTitle}. ${t.nameEntryHelp}. ${t.firstName}. ${t.lastName}.`
        )
      ];
    }
    if (step === STEPS.LANGUAGE) {
      return [
        segment(
          "language_screen",
          `${t.chooseLanguage} ${t.readoutLanguageOptions}: ${languageOptions
            .map((option) => option.label)
            .join(", ")}.`
        )
      ];
    }
    if (step === STEPS.ACTIVITIES) {
      return [
        segment("activities_intro", `${t.needToday}. ${t.chooseSupport}.`),
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
        withError("continue_button", t.continue)
      ];
    }
    if (step === STEPS.CONFIRMATION && confirmation) {
      return [
        segment("confirmation_base", `${t.checkedIn}. ${t.staffWillCall}.`),
        ...confirmation.items.map((item) => translateActivityName(item, language))
      ];
    }
    return [];
  }

  function beginIdentity() {
    setIdentity(DEFAULT_IDENTITY);
    setError("");
    setStep(STEPS.LANGUAGE);
  }

  function updateIdentity(field, value) {
    setIdentity((current) => ({ ...current, [field]: value }));
    setError("");
  }

  function handleFirstNameKeyDown(event) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    lastNameInputRef.current?.focus();
  }

  function handleLastNameKeyDown(event) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
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
      setStep(STEPS.ACTIVITIES);
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
    if (step === STEPS.LANGUAGE) setStep(STEPS.WELCOME);
    if (step === STEPS.IDENTITY) setStep(STEPS.LANGUAGE);
    if (step === STEPS.ACTIVITIES) setStep(STEPS.IDENTITY);
  }

  const hasBack = ![STEPS.WELCOME, STEPS.CONFIRMATION].includes(step);
  const isActivitiesStep = step === STEPS.ACTIVITIES;

  return (
    <section className={`kiosk-page ${hasBack ? "has-back" : ""}`} style={kioskThemeStyle}>
      <div className={`kiosk-stage ${hasBack ? "has-back" : ""} step-${step}`}>
        {hasBack && !isActivitiesStep ? (
          <button className="ghost-button kiosk-back" onClick={goBack}>
            <ChevronLeft size={22} />
            {t.back}
          </button>
        ) : null}
        {!isActivitiesStep ? (
          <>
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
          </>
        ) : null}

        {step === STEPS.ACTIVITIES ? (
          <div className="plain-activities-shell">
            <div className="plain-activity-toolbar">
              <button className="plain-activity-back" onClick={goBack} type="button">
                <ChevronLeft size={22} />
                {t.back}
              </button>
              <button
                type="button"
                className={`plain-activity-readout ${speaking ? "is-speaking" : ""}`}
                onClick={readCurrentScreen}
                aria-label={speaking ? t.stopReading : t.readPage}
              >
                {speaking ? <VolumeX size={24} /> : <Volume2 size={24} />}
              </button>
            </div>
            {readoutMessage ? <p className="plain-readout-feedback">{readoutMessage}</p> : null}
            <div className="plain-activity-heading">
              <h1>{t.needToday}</h1>
              <p>{t.chooseSupport}</p>
            </div>
            <div
              className={`plain-activity-grid activity-count-${
                activities.length >= 6 ? "many" : activities.length
              }`}
              data-activity-count={activities.length}
            >
              {activities.map((activity) => {
                const selected = selectedIds.includes(activity.id);
                const unavailable = activity.is_full || activity.is_unavailable;
                return (
                  <button
                    key={activity.id}
                    className={`plain-activity-card ${selected ? "is-selected" : ""} ${
                      unavailable ? "is-full" : ""
                    }`}
                    disabled={unavailable}
                    onClick={() => toggleActivity(activity)}
                  >
                    <ActivityIcon name={activity.icon} className="plain-activity-icon" />
                    <span>{translateActivityName(activity, language)}</span>
                    <small>
                      {activity.time_limit_enabled
                        ? formatActivityDuration(activity.duration_minutes, language)
                        : t.untimed}
                    </small>
                    {activity.daily_limit_enabled ? (
                      <small className="plain-activity-meta">
                        {activity.is_full
                          ? t.fullToday
                          : t.spotsLeft.replace("{count}", activity.daily_remaining)}
                      </small>
                    ) : null}
                    {activity.is_unavailable ? (
                      <small className="plain-activity-meta">{t.unavailableNow}</small>
                    ) : null}
                    {activity.availability_window_enabled ? (
                      <small className="plain-activity-meta">
                        {formatAvailabilityWindow(activity, t, language)}
                      </small>
                    ) : null}
                    {selected ? <Check className="plain-activity-check" size={22} /> : null}
                  </button>
                );
              })}
            </div>
            {error ? <p className="plain-activity-error">{error}</p> : null}
            <button
              className="plain-activity-continue"
              disabled={submitting}
              onClick={submitCheckIn}
              type="button"
            >
              {submitting ? t.saving : t.continue}
            </button>
          </div>
        ) : null}

        {!isActivitiesStep ? (
          <div className={`kiosk-shell ${hasBack ? "has-back" : ""} is-${step}`}>
            {step === STEPS.WELCOME ? (
              <div className="kiosk-center">
                <div className="kiosk-symbol">
                  <img
                    src="/icons/lh-house-mark.svg"
                    alt=""
                    className="kiosk-house-logo"
                    aria-hidden="true"
                  />
                </div>
                <h1>{t.welcome}</h1>
                <p className="kiosk-lede">{t.kioskPurpose}</p>
                <button className="primary-button kiosk-start" onClick={beginIdentity}>
                  <span>{t.checkInButton}</span>
                  <small>{t.chooseLanguage}</small>
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
                        autoCapitalize="words"
                        enterKeyHint="next"
                        value={identity.firstName}
                        onChange={(event) => updateIdentity("firstName", event.target.value)}
                        onKeyDown={handleFirstNameKeyDown}
                      />
                    </label>
                    <label>
                      <span>{t.lastName} *</span>
                      <input
                        ref={lastNameInputRef}
                        autoComplete="family-name"
                        autoCapitalize="words"
                        enterKeyHint="done"
                        value={identity.lastName}
                        onChange={(event) => updateIdentity("lastName", event.target.value)}
                        onKeyDown={handleLastNameKeyDown}
                      />
                    </label>
                  </div>
                  {error ? <p className="error-message">{error}</p> : null}
                  <button
                    className="primary-button kiosk-next"
                    disabled={checkingIdentity}
                    type="submit"
                  >
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
                        setIdentity(DEFAULT_IDENTITY);
                        setError("");
                        setStep(STEPS.IDENTITY);
                      }}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
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
                      {item.service_spot_status === "waitlist" ? (
                        <span>Waitlist #{item.service_spot_number}</span>
                      ) : item.service_spot_number ? (
                        <span>Spot #{item.service_spot_number}</span>
                      ) : null}
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
        ) : null}
      </div>
    </section>
  );
}

function formatAvailabilityWindow(activity, text, language) {
  return text.availableHours
    .replace("{start}", formatActivityClock(activity.availability_start, language))
    .replace("{end}", formatActivityClock(activity.availability_end, language));
}

function readoutSegmentText(segment) {
  return typeof segment === "string" ? segment : segment?.text || "";
}

function readoutSegmentKey(segment) {
  return typeof segment === "string" ? "" : segment?.key || "";
}
