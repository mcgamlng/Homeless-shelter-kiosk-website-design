import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  createHmongSpeechAudio,
  createHmongSpeechAudioResult,
  createHmongSpeechPlan,
  getCloudSpeechAudio,
  createLocalSpeechAudio,
  getHmongSyllablePath,
  getNaturalSpeechAudio,
  getSpanishSpeechAudio
} from "../server/speechService.js";

test("builds a native Hmong syllable plan and converts activity minutes", () => {
  const voicePath = fs.mkdtempSync(path.join(os.tmpdir(), "lh-hmong-voice-"));
  for (const token of ["da", "dej", "peb", "caug", "feeb"]) {
    fs.writeFileSync(path.join(voicePath, `${token}.wav`), token);
  }
  const previousPath = process.env.HMONG_VOICE_PATH;
  process.env.HMONG_VOICE_PATH = voicePath;
  try {
    const plan = createHmongSpeechPlan("Da dej 30 feeb.");
    assert.deepEqual(plan.tokens, ["da", "dej", "peb", "caug", "feeb"]);
    assert.equal(getHmongSyllablePath("dej"), path.join(voicePath, "dej.wav"));
    assert.equal(getHmongSyllablePath("../secret"), null);
  } finally {
    if (previousPath === undefined) delete process.env.HMONG_VOICE_PATH;
    else process.env.HMONG_VOICE_PATH = previousPath;
    fs.rmSync(voicePath, { recursive: true, force: true });
  }
});

test("proxies playable Spanish speech audio", async () => {
  const expected = Buffer.from("spanish-audio");
  const audio = await getSpanishSpeechAudio("Bienvenido.", async () => ({
    ok: true,
    headers: new Headers({ "content-type": "audio/mpeg" }),
    arrayBuffer: async () => expected
  }));
  assert.deepEqual(audio, expected);
});

test("builds one continuous playable Hmong wave file", () => {
  const voicePath = fs.mkdtempSync(path.join(os.tmpdir(), "lh-hmong-audio-"));
  const previousPath = process.env.HMONG_VOICE_PATH;
  process.env.HMONG_VOICE_PATH = voicePath;
  try {
    for (const token of ["da", "dej"]) {
      fs.writeFileSync(path.join(voicePath, `${token}.wav`), createTestWave());
    }
    const audio = createHmongSpeechAudio("Da dej.");
    assert.equal(audio.toString("ascii", 0, 4), "RIFF");
    assert.equal(audio.toString("ascii", 8, 12), "WAVE");
    assert.equal(audio.toString("ascii", 36, 40), "data");
    assert.equal(audio.readUInt32LE(4), audio.length - 8);
    assert.ok(audio.length > createTestWave().length);
    assert.ok(audio.length < createTestWave().length * 2);
  } finally {
    if (previousPath === undefined) delete process.env.HMONG_VOICE_PATH;
    else process.env.HMONG_VOICE_PATH = previousPath;
    fs.rmSync(voicePath, { recursive: true, force: true });
  }
});

test("prefers native Hmong phrase audio when the manifest text matches", () => {
  const phrasePath = fs.mkdtempSync(path.join(os.tmpdir(), "lh-hmong-phrases-"));
  const previousPath = process.env.HMONG_PHRASE_PATH;
  process.env.HMONG_PHRASE_PATH = phrasePath;
  try {
    const phraseAudio = createTestWave();
    fs.writeFileSync(path.join(phrasePath, "welcome.wav"), phraseAudio);
    fs.writeFileSync(
      path.join(phrasePath, "manifest.json"),
      JSON.stringify({
        phrases: [
          {
            key: "welcome_screen",
            text: "Zoo siab txais tos.",
            file: "welcome.wav"
          }
        ]
      })
    );
    const result = createHmongSpeechAudioResult("Zoo siab txais tos.", {
      key: "welcome_screen"
    });
    assert.equal(result.source, "phrase");
    assert.equal(result.phraseKey, "welcome_screen");
    assert.deepEqual(result.audio, phraseAudio);
  } finally {
    if (previousPath === undefined) delete process.env.HMONG_PHRASE_PATH;
    else process.env.HMONG_PHRASE_PATH = previousPath;
    fs.rmSync(phrasePath, { recursive: true, force: true });
  }
});

test("creates local server speech audio with espeak-ng compatible arguments", () => {
  const expected = createTestWave();
  const calls = [];
  const audio = createLocalSpeechAudio("Welcome to Listening House.", "en", {
    spawnImpl(command, args) {
      calls.push({ command, args });
      return { status: 0, stdout: expected };
    }
  });
  assert.deepEqual(audio, expected);
  assert.equal(calls[0].command, process.env.ESPEAK_NG_BIN || "espeak-ng");
  assert.deepEqual(calls[0].args.slice(0, 4), ["--stdout", "-v", "en-gb", "-s"]);
  assert.ok(calls[0].args.includes("Welcome to Listening House."));
});

test("local server speech falls back for Hmong and missing language voices", () => {
  const expected = createTestWave();
  const calls = [];
  const audio = createLocalSpeechAudio("Zoo siab txais tos.", "hmn", {
    spawnImpl(command, args) {
      calls.push({ command, args });
      return {
        status: calls.length === 1 ? 1 : 0,
        stdout: calls.length === 1 ? Buffer.from("") : expected
      };
    }
  });
  assert.deepEqual(audio, expected);
  assert.equal(calls[0].args[2], "en-gb");
  assert.equal(calls[1].args[2], "en");
});

test("local server speech rejects unknown languages", () => {
  assert.throws(() => createLocalSpeechAudio("Hello", "unknown"), /not configured/);
});

test("natural speech uses the configured British English voice", async () => {
  const expected = Buffer.from("natural-audio");
  const calls = [];
  const audio = await getNaturalSpeechAudio("Welcome.", "en", {
    async ttsImpl(text, options) {
      calls.push({ text, options });
      return expected;
    }
  });
  assert.deepEqual(audio, expected);
  assert.equal(calls[0].options.voice, "en-GB-RyanNeural");
});

test("cloud speech routes Somali and Hmong to language-specific targets", async () => {
  const requestedLanguages = [];
  const response = async (url) => {
    requestedLanguages.push(new URL(url).searchParams.get("tl"));
    return {
      ok: true,
      headers: new Headers({ "content-type": "audio/mpeg" }),
      arrayBuffer: async () => Buffer.from("cloud-audio")
    };
  };
  await getCloudSpeechAudio("Soo dhawoow.", "so", response);
  await getCloudSpeechAudio("Zoo siab txais tos.", "hmn", response);
  assert.deepEqual(requestedLanguages, ["so", "mww"]);
});

function createTestWave() {
  const samples = Buffer.alloc(160, 32);
  const wave = Buffer.alloc(44 + samples.length);
  wave.write("RIFF", 0);
  wave.writeUInt32LE(wave.length - 8, 4);
  wave.write("WAVE", 8);
  wave.write("fmt ", 12);
  wave.writeUInt32LE(16, 16);
  wave.writeUInt16LE(1, 20);
  wave.writeUInt16LE(1, 22);
  wave.writeUInt32LE(8000, 24);
  wave.writeUInt32LE(16000, 28);
  wave.writeUInt16LE(2, 32);
  wave.writeUInt16LE(16, 34);
  wave.write("data", 36);
  wave.writeUInt32LE(samples.length, 40);
  samples.copy(wave, 44);
  return wave;
}
