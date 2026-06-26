import test from "node:test";
import assert from "node:assert/strict";
import {
  formatActivityDuration,
  formatActivityDurationForSpeech,
  translateActivityName
} from "../src/i18n.js";

test("translates default activity names for kiosk languages", () => {
  assert.equal(translateActivityName("Shower", "es"), "Ducha");
  assert.equal(translateActivityName("Meal / Snacks", "hmn"), "Pluas mov / Khoom txom ncauj");
  assert.equal(translateActivityName("Phone Charging", "so"), "Ku dallacid telefoon");
});

test("auto-translates common custom activity words", () => {
  assert.equal(
    translateActivityName("Custom Staff Activity", "es"),
    "Actividad personalizada del personal"
  );
  assert.equal(translateActivityName("Private Shower Room", "so"), "Qol qubeys gaar ah");
});

test("uses saved activity translations before generated text", () => {
  assert.equal(
    translateActivityName({ name: "Custom Staff Activity", name_es: "Actividad revisada" }, "es"),
    "Actividad revisada"
  );
  assert.equal(
    translateActivityName(
      { activity_name: "Legal Support", activity_name_so: "Taageero sharci oo la hubiyay" },
      "so"
    ),
    "Taageero sharci oo la hubiyay"
  );
});

test("translates common custom shelter activity names", () => {
  assert.equal(translateActivityName("Beds", "es"), "Camas");
  assert.equal(translateActivityName("Private Rooms", "hmn"), "Chav ntiag tug");
  assert.equal(
    translateActivityName("Case Management and Legal Support", "so"),
    "Maareynta kiisaska iyo taageero sharci"
  );
});

test("formats activity duration in the selected kiosk language", () => {
  assert.equal(formatActivityDuration(30, "en"), "30 min");
  assert.equal(formatActivityDuration(30, "hmn"), "30 feeb");
  assert.equal(formatActivityDuration(30, "so"), "30 daqiiqo");
});

test("formats activity duration for speech", () => {
  assert.equal(formatActivityDurationForSpeech(30, "en"), "30 minutes");
  assert.equal(formatActivityDurationForSpeech(1, "en"), "1 minute");
  assert.equal(formatActivityDurationForSpeech(30, "es"), "30 minutos");
});
