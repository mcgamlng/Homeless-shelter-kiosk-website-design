const speechLanguageCodes = {
  en: ["en-GB", "en-US", "en"],
  es: ["es-US", "es-MX", "es-ES", "es"],
  hmn: ["hmn-US", "hmn", "mww-US", "mww"],
  so: ["so-SO", "so"]
};
const britishVoiceHints = ["british", "uk", "england", "daniel", "george", "sonia", "google uk"];
const naturalVoiceHints = ["natural", "neural", "premium", "enhanced", "google", "microsoft"];
const multilingualVoiceHints = ["multilingual", "multi-language", "multi language"];

const speechProfiles = {
  en: { pitch: 1, rate: 0.92 },
  es: { pitch: 1.02, rate: 0.9 },
  hmn: { pitch: 1.04, rate: 0.82 },
  so: { pitch: 0.98, rate: 0.88 }
};

function includesHint(value, hints) {
  const cleanValue = String(value || "").toLowerCase();
  return hints.some((hint) => cleanValue.includes(hint));
}

export function chooseSpeechVoice(voices = [], currentLanguage = "en") {
  const languageCodes = speechLanguageCodes[currentLanguage] || speechLanguageCodes.en;
  const matchingVoices = voices.filter((voice) =>
    languageCodes.some((code) =>
      String(voice.lang || "")
        .toLowerCase()
        .startsWith(code.toLowerCase())
    )
  );
  if (currentLanguage === "en") {
    const britishVoice = matchingVoices.find((voice) =>
      includesHint(voice.name, britishVoiceHints)
    );
    if (britishVoice) return britishVoice;
  }
  const naturalVoice = matchingVoices.find((voice) => includesHint(voice.name, naturalVoiceHints));
  if (naturalVoice) return naturalVoice;
  if (matchingVoices[0]) return matchingVoices[0];
  const multilingualVoice = voices.find((voice) =>
    includesHint(voice.name, multilingualVoiceHints)
  );
  if (multilingualVoice) return multilingualVoice;
  return currentLanguage === "en" ? voices[0] || null : null;
}

export function preferredSpeechLanguage(currentLanguage = "en") {
  return (speechLanguageCodes[currentLanguage] || speechLanguageCodes.en)[0];
}

export function speechProfile(currentLanguage = "en") {
  return speechProfiles[currentLanguage] || speechProfiles.en;
}
