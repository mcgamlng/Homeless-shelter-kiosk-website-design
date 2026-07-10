import { getActivities } from "../server/repository.js";
import { preloadBestSpeechAudio } from "../server/speechService.js";
import { translations } from "../src/i18n.js";

const languages = ["en", "es", "hmn", "so"];

function durationText(minutes, language) {
  const count = Number(minutes || 0);
  if (language === "hmn") return `${count} feeb`;
  if (language === "so") return `${count} daqiiqo`;
  if (language === "es") return `${count} minutos`;
  return `${count} minutes`;
}

function activityName(activity, language) {
  if (language === "es") return activity.name_es || activity.name;
  if (language === "hmn") return activity.name_hmn || activity.name;
  if (language === "so") return activity.name_so || activity.name;
  return activity.name;
}

function fixedKioskSegments() {
  const keys = [
    "welcome",
    "kioskPurpose",
    "nameEntryTitle",
    "nameEntryHelp",
    "chooseLanguage",
    "needToday",
    "chooseSupport",
    "checkedIn",
    "staffWillCall",
    "finish",
    "readPage",
    "stopReading",
    "readoutStopped",
    "fullToday",
    "unavailableNow"
  ];

  return languages.flatMap((language) => {
    const words = { ...translations.en, ...(translations[language] || {}) };
    return keys
      .map((key) => ({ language, key: `kiosk_${key}`, text: words[key] }))
      .filter((segment) => segment.text);
  });
}

function activitySegments() {
  const activities = getActivities({ includeInactive: true });
  return languages.flatMap((language) =>
    activities.flatMap((activity) => {
      const name = activityName(activity, language);
      const timing = activity.time_limit_enabled
        ? durationText(activity.duration_minutes, language)
        : translations[language]?.untimed || translations.en.untimed;
      return [
        {
          language,
          key: `activity_${activity.id}_${language}`,
          text: name
        },
        {
          language,
          key: `activity_${activity.id}_${language}_with_time`,
          text: `${name}, ${timing}.`
        }
      ];
    })
  );
}

function dedupeSegments(segments) {
  const seen = new Set();
  return segments.filter((segment) => {
    const key = `${segment.language}:${segment.key}:${segment.text}`;
    if (!segment.text || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const segments = dedupeSegments([...fixedKioskSegments(), ...activitySegments()]);
const results = await preloadBestSpeechAudio(segments);
const succeeded = results.filter((result) => result.ok).length;
const failed = results.length - succeeded;

console.log(`Speech preload finished: ${succeeded}/${results.length} cached or ready.`);
if (failed) {
  console.log(`${failed} speech segments could not be preloaded and will use live fallback later.`);
  results
    .filter((result) => !result.ok)
    .slice(0, 12)
    .forEach((result) => {
      console.log(`- ${result.language}: ${result.text} (${result.error})`);
    });
}
