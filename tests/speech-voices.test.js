import assert from "node:assert/strict";
import test from "node:test";
import { chooseSpeechVoice, preferredSpeechLanguage, speechProfile } from "../src/speechVoices.js";

const voices = [
  { name: "English UK", lang: "en-GB" },
  { name: "Google español", lang: "es-US" },
  { name: "Cod Soomaali", lang: "so-SO" }
];

test("selects a voice that matches the kiosk language", () => {
  assert.equal(chooseSpeechVoice(voices, "es")?.lang, "es-US");
  assert.equal(chooseSpeechVoice(voices, "so")?.lang, "so-SO");
  assert.equal(preferredSpeechLanguage("hmn"), "hmn-US");
});

test("never falls back to an English voice for a non-English readout", () => {
  assert.equal(chooseSpeechVoice(voices, "hmn"), null);
});

test("recognizes Hmong Daw locale aliases and multilingual voices", () => {
  const hmongVoice = { name: "Hmong Daw", lang: "mww-US" };
  assert.equal(chooseSpeechVoice([...voices, hmongVoice], "hmn"), hmongVoice);

  const multilingualVoice = { name: "Ava Multilingual Natural", lang: "en-US" };
  assert.equal(chooseSpeechVoice([...voices, multilingualVoice], "hmn"), multilingualVoice);
});

test("uses a slower natural pacing profile for every supported language", () => {
  for (const language of ["en", "es", "hmn", "so"]) {
    const profile = speechProfile(language);
    assert.ok(profile.rate >= 0.8 && profile.rate < 1);
    assert.ok(profile.pitch >= 0.9 && profile.pitch <= 1.1);
  }
});
