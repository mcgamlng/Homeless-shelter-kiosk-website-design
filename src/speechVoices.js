const speechLanguageCodes = {
  en: ["en-GB", "en-US", "en"],
  es: ["es-US", "es-MX", "es-ES", "es"],
  hmn: ["hmn"],
  so: ["so-SO", "so"]
};
const britishVoiceHints = ["british", "uk", "england", "daniel", "george", "sonia", "google uk"];
const naturalVoiceHints = ["natural", "neural", "premium", "enhanced", "google", "microsoft"];

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
      britishVoiceHints.some((hint) =>
        String(voice.name || "")
          .toLowerCase()
          .includes(hint)
      )
    );
    if (britishVoice) return britishVoice;
  }
  const naturalVoice = matchingVoices.find((voice) =>
    naturalVoiceHints.some((hint) =>
      String(voice.name || "")
        .toLowerCase()
        .includes(hint)
    )
  );
  if (naturalVoice) return naturalVoice;
  if (matchingVoices[0]) return matchingVoices[0];
  return currentLanguage === "en" ? voices[0] || null : null;
}

export function preferredSpeechLanguage(currentLanguage = "en") {
  return (speechLanguageCodes[currentLanguage] || speechLanguageCodes.en)[0];
}
