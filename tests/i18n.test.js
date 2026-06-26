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

test("keeps unknown custom activity names visible", () => {
  assert.equal(translateActivityName("Custom Staff Activity", "es"), "Custom Staff Activity");
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
