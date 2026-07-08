import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { tts as edgeTts } from "edge-tts/out/index.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultHmongVoicePath = path.join(projectRoot, "data", "hmong-voice", "Kong");
const defaultHmongPhrasePath = path.join(projectRoot, "data", "hmong-phrases");
const spanishAudioCache = new Map();
const hmongAudioCache = new Map();
const localSpeechCache = new Map();
const naturalSpeechCache = new Map();
const cloudSpeechCache = new Map();
const MAX_SPANISH_CACHE_ITEMS = 120;
const MAX_HMONG_CACHE_ITEMS = 120;
const MAX_LOCAL_SPEECH_CACHE_ITEMS = 160;
const MAX_NATURAL_SPEECH_CACHE_ITEMS = 120;
const MAX_CLOUD_SPEECH_CACHE_ITEMS = 120;
const MAX_SPEECH_TEXT_LENGTH = 350;
const HMONG_CROSSFADE_MILLISECONDS = 120;
const HMONG_BOUNDARY_THRESHOLD = 900;
const hmongCompoundWords = {
  sijhawm: ["sij", "hawm"]
};
const localSpeechVoices = {
  en: "en-gb",
  es: "es",
  so: "so"
};
const naturalSpeechVoices = {
  en: "en-GB-RyanNeural",
  es: "es-US-AlonsoNeural",
  so: "so-SO-UbaxNeural"
};
const cloudSpeechLanguages = {
  es: "es-US",
  so: "so",
  hmn: "hmn"
};

let hmongVoiceIndex = null;
let indexedHmongVoicePath = "";
let hmongPhraseCatalog = null;
let indexedHmongPhrasePath = "";

function cleanSpeechText(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_SPEECH_TEXT_LENGTH);
}

function hmongVoicePath() {
  return path.resolve(process.env.HMONG_VOICE_PATH || defaultHmongVoicePath);
}

function hmongPhrasePath() {
  return path.resolve(process.env.HMONG_PHRASE_PATH || defaultHmongPhrasePath);
}

function loadHmongVoiceIndex() {
  const voicePath = hmongVoicePath();
  if (hmongVoiceIndex && indexedHmongVoicePath === voicePath) return hmongVoiceIndex;
  indexedHmongVoicePath = voicePath;
  hmongVoiceIndex = new Set();
  if (!fs.existsSync(voicePath)) return hmongVoiceIndex;
  for (const filename of fs.readdirSync(voicePath)) {
    if (!filename.toLowerCase().endsWith(".wav")) continue;
    hmongVoiceIndex.add(path.basename(filename, ".wav").toLowerCase());
  }
  return hmongVoiceIndex;
}

function normalizeHmongPhraseText(text) {
  return normalizeHmongText(text)
    .normalize("NFKD")
    .replace(/[^\p{Letter}\p{Number}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function safePhraseFilePath(basePath, filename) {
  const cleanFilename = String(filename || "").replaceAll("\\", "/");
  if (!cleanFilename || cleanFilename.includes("..") || path.isAbsolute(cleanFilename)) {
    return "";
  }
  if (!cleanFilename.toLowerCase().endsWith(".wav")) return "";
  const filePath = path.resolve(basePath, cleanFilename);
  return filePath === basePath || filePath.startsWith(`${basePath}${path.sep}`) ? filePath : "";
}

function loadHmongPhraseCatalog() {
  const phrasePath = hmongPhrasePath();
  if (hmongPhraseCatalog && indexedHmongPhrasePath === phrasePath) return hmongPhraseCatalog;
  indexedHmongPhrasePath = phrasePath;
  const catalog = {
    entries: [],
    byKey: new Map(),
    byText: new Map(),
    manifestPath: path.join(phrasePath, "manifest.json"),
    errors: []
  };
  hmongPhraseCatalog = catalog;
  if (!fs.existsSync(catalog.manifestPath)) return catalog;

  try {
    const manifest = JSON.parse(fs.readFileSync(catalog.manifestPath, "utf8"));
    const entries = Array.isArray(manifest?.phrases) ? manifest.phrases : [];
    for (const entry of entries) {
      const key = String(entry.key || "").trim();
      const text = cleanSpeechText(entry.text);
      const filePath = safePhraseFilePath(phrasePath, entry.file);
      if (!key || !text || !filePath) {
        catalog.errors.push(`Skipped incomplete phrase entry: ${key || entry.file || "unknown"}`);
        continue;
      }
      if (!fs.existsSync(filePath)) {
        catalog.errors.push(`Missing Hmong phrase file: ${entry.file}`);
        continue;
      }
      const cleanEntry = {
        key,
        text,
        normalizedText: normalizeHmongPhraseText(text),
        file: filePath,
        filename: entry.file
      };
      catalog.entries.push(cleanEntry);
      catalog.byKey.set(key, cleanEntry);
      catalog.byText.set(cleanEntry.normalizedText, cleanEntry);
    }
  } catch (error) {
    catalog.errors.push(`Could not read Hmong phrase manifest: ${error.message}`);
  }

  return catalog;
}

function hmongNumberWords(value) {
  const number = Number(value);
  const ones = ["xoom", "ib", "ob", "peb", "plaub", "tsib", "rau", "xya", "yim", "cuaj"];
  if (!Number.isInteger(number) || number < 0 || number > 100) return String(value);
  if (number < 10) return ones[number];
  if (number === 10) return "kaum";
  if (number < 20) return `kaum ${ones[number - 10]}`;
  if (number === 20) return "nees nkaum";
  if (number < 30) return `nees nkaum ${ones[number - 20]}`;
  if (number === 100) return "ib puas";
  const tens = Math.floor(number / 10);
  const remainder = number % 10;
  return `${ones[tens]} caug${remainder ? ` ${ones[remainder]}` : ""}`;
}

function normalizeHmongText(text) {
  return cleanSpeechText(text)
    .replace(/\b\d{1,3}\b/g, (value) => hmongNumberWords(value))
    .toLowerCase();
}

function resolveHmongToken(token, voiceIndex) {
  if (voiceIndex.has(token)) return token;
  if (token.endsWith("g")) {
    const alternateTone = `${token.slice(0, -1)}s`;
    if (voiceIndex.has(alternateTone)) return alternateTone;
  }
  return null;
}

export function getSpeechStatus() {
  const voiceIndex = loadHmongVoiceIndex();
  const phraseCatalog = loadHmongPhraseCatalog();
  const phraseCount = phraseCatalog.entries.length;
  const fallbackReady = voiceIndex.size > 1000;
  const localSpeech = inspectLocalSpeech();
  const naturalSpeech = inspectNaturalSpeech();
  return {
    hmongSpeechMode: phraseCount
      ? "phrase-first"
      : fallbackReady
        ? "fallback-syllable"
        : "not-installed",
    hmongPhraseReady: phraseCount > 0,
    hmongPhraseCount: phraseCount,
    hmongPhrasePath: hmongPhrasePath(),
    hmongPhraseManifestPath: phraseCatalog.manifestPath,
    hmongPhraseErrors: phraseCatalog.errors,
    hmongVoiceReady: fallbackReady,
    hmongVoiceSamples: voiceIndex.size,
    hmongVoicePath: hmongVoicePath(),
    spanishVoiceReady: true,
    naturalSpeechReady: naturalSpeech.ready,
    naturalSpeechVoices,
    naturalSpeechError: naturalSpeech.error,
    cloudSpeechLanguages: Object.keys(cloudSpeechLanguages),
    serverSpeechReady: localSpeech.ready,
    serverSpeechCommand: localSpeech.command,
    serverSpeechLanguages: Object.keys(localSpeechVoices),
    serverSpeechError: localSpeech.error
  };
}

export function createHmongSpeechPlan(text) {
  const voiceIndex = loadHmongVoiceIndex();
  if (voiceIndex.size === 0) {
    const error = new Error(
      "The local Hmong voice pack is not installed. Run npm run speech:install-hmong."
    );
    error.status = 503;
    throw error;
  }
  const words = normalizeHmongText(text).match(/[a-z]+/g) || [];
  const tokens = [];
  const missing = [];
  for (const word of words) {
    const compound = hmongCompoundWords[word];
    if (compound?.every((part) => voiceIndex.has(part))) {
      tokens.push(...compound);
      continue;
    }
    const resolved = resolveHmongToken(word, voiceIndex);
    if (resolved) {
      tokens.push(resolved);
    } else if (!missing.includes(word)) {
      missing.push(word);
    }
  }
  if (tokens.length === 0) {
    const error = new Error("No readable Hmong words were found on this screen.");
    error.status = 422;
    throw error;
  }
  return {
    tokens,
    missing,
    urls: tokens.map((token) => `/api/speech/hmong-syllable/${encodeURIComponent(token)}`)
  };
}

export function getHmongSyllablePath(token) {
  const cleanToken = String(token || "").toLowerCase();
  if (!/^[a-z0-9-]+$/.test(cleanToken)) return null;
  const voiceIndex = loadHmongVoiceIndex();
  if (!voiceIndex.has(cleanToken)) return null;
  return path.join(hmongVoicePath(), `${cleanToken}.wav`);
}

export function createHmongSpeechAudio(text) {
  return createHmongSpeechAudioResult(text).audio;
}

export function createHmongSpeechAudioResult(text, options = {}) {
  const cleanText = cleanSpeechText(text);
  const phrase = findHmongPhrase(cleanText, options.key);
  if (phrase) {
    return {
      audio: fs.readFileSync(phrase.file),
      source: "phrase",
      phraseKey: phrase.key,
      filename: phrase.filename
    };
  }

  const cacheKey = `fallback:${cleanText}`;
  if (hmongAudioCache.has(cacheKey)) {
    return { audio: hmongAudioCache.get(cacheKey), source: "fallback-syllable" };
  }

  const plan = createHmongSpeechPlan(cleanText);
  const clips = plan.tokens.map((token, index) => {
    const clip = readWaveClip(getHmongSyllablePath(token));
    return {
      ...clip,
      data: trimHmongBoundary(clip, {
        isFirst: index === 0,
        isFinal: index === plan.tokens.length - 1
      })
    };
  });
  const first = clips[0];
  const audioData = clips.slice(1).reduce((joined, clip) => {
    assertMatchingWaveFormat(first, clip);
    return crossfadePcm(joined, clip.data, first);
  }, Buffer.from(first.data));
  const audio = buildWaveFile(first, audioData);
  hmongAudioCache.set(cacheKey, audio);
  if (hmongAudioCache.size > MAX_HMONG_CACHE_ITEMS) {
    hmongAudioCache.delete(hmongAudioCache.keys().next().value);
  }
  return { audio, source: "fallback-syllable", missing: plan.missing };
}

function findHmongPhrase(text, key) {
  const catalog = loadHmongPhraseCatalog();
  if (!catalog.entries.length) return null;
  const normalizedText = normalizeHmongPhraseText(text);
  const keyedPhrase = key ? catalog.byKey.get(String(key)) : null;
  if (keyedPhrase?.normalizedText === normalizedText) return keyedPhrase;
  return catalog.byText.get(normalizedText) || null;
}

function trimHmongBoundary(clip, { isFirst, isFinal }) {
  if (clip.bitsPerSample !== 16) return clip.data;
  const totalFrames = Math.floor(clip.data.length / clip.blockAlign);
  let firstActiveFrame = 0;
  if (!isFirst) {
    for (let frame = 0; frame < totalFrames; frame += 1) {
      if (framePeak(clip, frame) >= HMONG_BOUNDARY_THRESHOLD) {
        firstActiveFrame = frame;
        break;
      }
    }
  }
  let lastActiveFrame = totalFrames - 1;
  if (!isFinal) {
    for (let frame = totalFrames - 1; frame >= 0; frame -= 1) {
      if (framePeak(clip, frame) >= HMONG_BOUNDARY_THRESHOLD) {
        lastActiveFrame = frame;
        break;
      }
    }
  }
  const attackFrames = Math.round(clip.sampleRate * 0.002);
  const releaseFrames = Math.round(clip.sampleRate * 0.003);
  const startFrame = Math.max(0, firstActiveFrame - attackFrames);
  const endFrame = Math.min(totalFrames, lastActiveFrame + releaseFrames);
  return clip.data.subarray(
    startFrame * clip.blockAlign,
    Math.max((startFrame + 1) * clip.blockAlign, endFrame * clip.blockAlign)
  );
}

function framePeak(clip, frame) {
  let peak = 0;
  for (let channel = 0; channel < clip.channels; channel += 1) {
    const sampleOffset = frame * clip.blockAlign + channel * 2;
    peak = Math.max(peak, Math.abs(clip.data.readInt16LE(sampleOffset)));
  }
  return peak;
}

function readWaveClip(filePath) {
  if (!filePath) throw new Error("Hmong speech sample not found.");
  const wave = fs.readFileSync(filePath);
  if (wave.toString("ascii", 0, 4) !== "RIFF" || wave.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("Invalid Hmong speech sample.");
  }

  let format = null;
  let data = null;
  let offset = 12;
  while (offset + 8 <= wave.length) {
    const chunkId = wave.toString("ascii", offset, offset + 4);
    const chunkSize = wave.readUInt32LE(offset + 4);
    const chunkStart = offset + 8;
    const chunkEnd = Math.min(chunkStart + chunkSize, wave.length);
    if (chunkId === "fmt " && chunkSize >= 16) {
      format = {
        audioFormat: wave.readUInt16LE(chunkStart),
        channels: wave.readUInt16LE(chunkStart + 2),
        sampleRate: wave.readUInt32LE(chunkStart + 4),
        byteRate: wave.readUInt32LE(chunkStart + 8),
        blockAlign: wave.readUInt16LE(chunkStart + 12),
        bitsPerSample: wave.readUInt16LE(chunkStart + 14)
      };
    }
    if (chunkId === "data") data = wave.subarray(chunkStart, chunkEnd);
    offset = chunkEnd + (chunkSize % 2);
  }
  if (!format || !data || format.audioFormat !== 1) {
    throw new Error("Unsupported Hmong speech sample format.");
  }
  return { ...format, data };
}

function crossfadePcm(left, right, format) {
  if (format.bitsPerSample !== 16) return Buffer.concat([left, right]);
  const maxFrames = Math.min(
    Math.floor(left.length / format.blockAlign / 4),
    Math.floor(right.length / format.blockAlign / 4)
  );
  const overlapFrames = Math.min(
    Math.round(format.sampleRate * (HMONG_CROSSFADE_MILLISECONDS / 1000)),
    maxFrames
  );
  if (overlapFrames < 2) return Buffer.concat([left, right]);

  const overlapBytes = overlapFrames * format.blockAlign;
  const leftBodyLength = left.length - overlapBytes;
  const output = Buffer.alloc(left.length + right.length - overlapBytes);
  left.copy(output, 0, 0, leftBodyLength);

  for (let frame = 0; frame < overlapFrames; frame += 1) {
    const progress = frame / (overlapFrames - 1);
    const leftWeight = Math.cos(progress * Math.PI * 0.5);
    const rightWeight = Math.sin(progress * Math.PI * 0.5);
    for (let channel = 0; channel < format.channels; channel += 1) {
      const sampleOffset = frame * format.blockAlign + channel * 2;
      const leftSample = left.readInt16LE(leftBodyLength + sampleOffset);
      const rightSample = right.readInt16LE(sampleOffset);
      const blended = Math.round(leftSample * leftWeight + rightSample * rightWeight);
      output.writeInt16LE(
        Math.max(-32768, Math.min(32767, blended)),
        leftBodyLength + sampleOffset
      );
    }
  }
  right.copy(output, left.length, overlapBytes);
  return output;
}

function assertMatchingWaveFormat(expected, actual) {
  const fields = ["audioFormat", "channels", "sampleRate", "blockAlign", "bitsPerSample"];
  if (fields.some((field) => expected[field] !== actual[field])) {
    throw new Error("Hmong speech samples use different audio formats.");
  }
}

function buildWaveFile(format, data) {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(format.audioFormat, 20);
  header.writeUInt16LE(format.channels, 22);
  header.writeUInt32LE(format.sampleRate, 24);
  header.writeUInt32LE(format.byteRate, 28);
  header.writeUInt16LE(format.blockAlign, 32);
  header.writeUInt16LE(format.bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

export async function getNaturalSpeechAudio(text, language = "en", { ttsImpl = edgeTts } = {}) {
  const cleanText = cleanSpeechText(text);
  if (!cleanText) {
    const error = new Error("Speech text is required.");
    error.status = 400;
    throw error;
  }
  const voice = naturalSpeechVoices[language];
  if (!voice) {
    const error = new Error("Natural speech is not configured for this language.");
    error.status = 422;
    throw error;
  }
  const cacheKey = `${language}:${cleanText}`;
  if (naturalSpeechCache.has(cacheKey)) return naturalSpeechCache.get(cacheKey);

  try {
    const audio = Buffer.from(
      await ttsImpl(cleanText, {
        voice,
        rate: "-8%",
        pitch: "-2Hz"
      })
    );
    if (!audio.length) throw new Error("Natural speech returned no audio.");
    naturalSpeechCache.set(cacheKey, audio);
    if (naturalSpeechCache.size > MAX_NATURAL_SPEECH_CACHE_ITEMS) {
      naturalSpeechCache.delete(naturalSpeechCache.keys().next().value);
    }
    return audio;
  } catch (error) {
    const wrapped = new Error(`Natural speech is temporarily unavailable: ${error.message}`);
    wrapped.status = 502;
    throw wrapped;
  }
}

export async function getCloudSpeechAudio(text, language = "es", fetchImpl = fetch) {
  const cleanText = cleanSpeechText(text);
  if (!cleanText) {
    const error = new Error("Speech text is required.");
    error.status = 400;
    throw error;
  }
  const targetLanguage = cloudSpeechLanguages[language];
  if (!targetLanguage) {
    const error = new Error("Cloud speech is not configured for this language.");
    error.status = 422;
    throw error;
  }
  const cacheKey = `${language}:${cleanText}`;
  if (cloudSpeechCache.has(cacheKey)) return cloudSpeechCache.get(cacheKey);

  const url = new URL("https://translate.google.com/translate_tts");
  url.searchParams.set("ie", "UTF-8");
  url.searchParams.set("client", "tw-ob");
  url.searchParams.set("tl", targetLanguage);
  url.searchParams.set("q", cleanText);
  const response = await fetchImpl(url, {
    headers: {
      Accept: "audio/mpeg",
      "User-Agent": "Mozilla/5.0 ListeningHouseKiosk/1.0"
    },
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok || !String(response.headers.get("content-type") || "").includes("audio")) {
    const error = new Error("The cloud speech service is temporarily unavailable.");
    error.status = 502;
    throw error;
  }
  const audio = Buffer.from(await response.arrayBuffer());
  cloudSpeechCache.set(cacheKey, audio);
  if (cloudSpeechCache.size > MAX_CLOUD_SPEECH_CACHE_ITEMS) {
    cloudSpeechCache.delete(cloudSpeechCache.keys().next().value);
  }
  return audio;
}

export async function getSpanishSpeechAudio(text, fetchImpl = fetch) {
  if (spanishAudioCache.has(text)) return spanishAudioCache.get(text);
  const audio = await getCloudSpeechAudio(text, "es", fetchImpl);
  spanishAudioCache.set(text, audio);
  if (spanishAudioCache.size > MAX_SPANISH_CACHE_ITEMS) {
    spanishAudioCache.delete(spanishAudioCache.keys().next().value);
  }
  return audio;
}

export function createLocalSpeechAudio(text, language = "en", { spawnImpl = spawnSync } = {}) {
  const cleanText = cleanSpeechText(text);
  if (!cleanText) {
    const error = new Error("Speech text is required.");
    error.status = 400;
    throw error;
  }
  const voice = localSpeechVoices[language];
  if (!voice) {
    const error = new Error("Server speech is not configured for this language.");
    error.status = 422;
    throw error;
  }

  const cacheKey = `${language}:${cleanText}`;
  if (localSpeechCache.has(cacheKey)) return localSpeechCache.get(cacheKey);

  const command = localSpeechCommand();
  const result = spawnImpl(command, ["--stdout", "-v", voice, "-s", "145", "-p", "42", cleanText], {
    encoding: "buffer",
    maxBuffer: 1024 * 1024 * 4
  });

  if (result.error || result.status !== 0 || !result.stdout?.length) {
    const error = new Error(
      "Server speech is not installed. On Raspberry Pi, install it with: sudo apt-get install -y espeak-ng"
    );
    error.status = 503;
    throw error;
  }

  const audio = Buffer.from(result.stdout);
  localSpeechCache.set(cacheKey, audio);
  if (localSpeechCache.size > MAX_LOCAL_SPEECH_CACHE_ITEMS) {
    localSpeechCache.delete(localSpeechCache.keys().next().value);
  }
  return audio;
}

function localSpeechCommand() {
  return process.env.ESPEAK_NG_BIN || "espeak-ng";
}

function inspectLocalSpeech() {
  const command = localSpeechCommand();
  const result = spawnSync(command, ["--version"], {
    encoding: "utf8",
    timeout: 2000
  });
  return {
    command,
    ready: !result.error && result.status === 0,
    error: result.error ? result.error.message : result.status === 0 ? "" : result.stderr || ""
  };
}

function inspectNaturalSpeech() {
  return {
    ready: true,
    error: ""
  };
}
