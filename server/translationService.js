import { buildActivityTranslations } from "../shared/activityTranslations.js";

const TARGET_LANGUAGES = {
  name_es: "es",
  name_hmn: "hmn",
  name_so: "so"
};
const DEFAULT_TRANSLATION_URL = "https://translate.googleapis.com/translate_a/single";

export async function translateActivityLabel(
  name,
  {
    fetchImpl = globalThis.fetch,
    endpoint = process.env.ACTIVITY_TRANSLATION_URL || DEFAULT_TRANSLATION_URL
  } = {}
) {
  const source = cleanText(name);
  const localTranslations = buildActivityTranslations(source);
  if (!source) {
    return { translations: localTranslations, source: "local", complete: false };
  }

  const entries = await Promise.all(
    Object.entries(TARGET_LANGUAGES).map(async ([field, language]) => {
      const local = cleanText(localTranslations[field]);
      if (local && normalize(local) !== normalize(source)) return [field, local, "local"];
      const online = await requestTranslation(source, language, fetchImpl, endpoint);
      return [field, online, online ? "online" : "missing"];
    })
  );
  const translations = Object.fromEntries(entries.map(([field, value]) => [field, value]));
  const complete = Object.values(translations).every(Boolean);
  const usedOnline = entries.some(([, , translationSource]) => translationSource === "online");

  return {
    translations,
    source: usedOnline ? "online" : "local",
    complete
  };
}

export async function enrichActivityTranslations(payload = {}, options = {}) {
  const source = cleanText(payload.name);
  if (!source) return { ...payload };

  const result = await translateActivityLabel(source, options);
  return Object.keys(TARGET_LANGUAGES).reduce(
    (nextPayload, field) => {
      const currentValue = cleanText(payload[field]);
      const shouldReplace = !currentValue || normalize(currentValue) === normalize(source);
      nextPayload[field] = shouldReplace
        ? result.translations[field] || currentValue
        : currentValue;
      return nextPayload;
    },
    { ...payload }
  );
}

async function requestTranslation(text, target, fetchImpl, endpoint) {
  if (typeof fetchImpl !== "function") return "";
  try {
    const url = new URL(endpoint);
    url.search = new URLSearchParams({
      client: "gtx",
      sl: "en",
      tl: target,
      dt: "t",
      q: text
    });
    const response = await fetchImpl(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(6000)
    });
    if (!response.ok) return "";
    const body = await response.json();
    const translated = Array.isArray(body?.[0])
      ? body[0].map((part) => part?.[0] || "").join("")
      : "";
    return decodeEntities(cleanText(translated));
  } catch {
    return "";
  }
}

function cleanText(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 160);
}

function normalize(value) {
  return cleanText(value).toLocaleLowerCase();
}

function decodeEntities(value) {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}
