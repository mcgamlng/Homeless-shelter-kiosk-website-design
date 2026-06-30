import assert from "node:assert/strict";
import test from "node:test";
import { chooseSpeechVoice, preferredSpeechLanguage } from "../src/speechVoices.js";

const voices = [
  { name: "English UK", lang: "en-GB" },
  { name: "Google español", lang: "es-US" },
  { name: "Cod Soomaali", lang: "so-SO" }
];

test("selects a voice that matches the kiosk language", () => {
  assert.equal(chooseSpeechVoice(voices, "es")?.lang, "es-US");
  assert.equal(chooseSpeechVoice(voices, "so")?.lang, "so-SO");
  assert.equal(preferredSpeechLanguage("hmn"), "hmn");
});

test("never falls back to an English voice for a non-English readout", () => {
  assert.equal(chooseSpeechVoice(voices, "hmn"), null);
});
