import assert from "node:assert/strict";
import test from "node:test";
import {
  enrichActivityTranslations,
  translateActivityLabel
} from "../server/translationService.js";

const translatedValues = {
  es: "Cuidado dental",
  hmn: "Kev kho hniav",
  so: "Daryeelka ilkaha"
};

async function fakeTranslationFetch(url) {
  const target = new URL(url).searchParams.get("tl");
  return {
    ok: true,
    async json() {
      return [[[translatedValues[target], "Dental care"]]];
    }
  };
}

test("online activity translation fills Spanish, Hmong, and Somali", async () => {
  const result = await translateActivityLabel("Dental care", {
    fetchImpl: fakeTranslationFetch
  });

  assert.deepEqual(result.translations, {
    name_es: "Cuidado dental",
    name_hmn: "Kev kho hniav",
    name_so: "Daryeelka ilkaha"
  });
  assert.equal(result.source, "online");
  assert.equal(result.complete, true);
});

test("activity translation replaces English fallbacks but preserves manual corrections", async () => {
  const result = await enrichActivityTranslations(
    {
      name: "Dental care",
      name_es: "Dental care",
      name_hmn: "",
      name_so: "Tarjumid gacanta ah"
    },
    { fetchImpl: fakeTranslationFetch }
  );

  assert.equal(result.name_es, "Cuidado dental");
  assert.equal(result.name_hmn, "Kev kho hniav");
  assert.equal(result.name_so, "Tarjumid gacanta ah");
});
