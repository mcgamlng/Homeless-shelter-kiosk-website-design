import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultHmongVoicePath = path.join(projectRoot, "data", "hmong-voice", "Kong");
const spanishAudioCache = new Map();
const hmongAudioCache = new Map();
const MAX_SPANISH_CACHE_ITEMS = 120;
const MAX_HMONG_CACHE_ITEMS = 120;
const MAX_SPEECH_TEXT_LENGTH = 350;
const hmongCompoundWords = {
  sijhawm: ["sij", "hawm"]
};

let hmongVoiceIndex = null;
let indexedHmongVoicePath = "";

function cleanSpeechText(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_SPEECH_TEXT_LENGTH);
}

function hmongVoicePath() {
  return path.resolve(process.env.HMONG_VOICE_PATH || defaultHmongVoicePath);
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
  return {
    hmongVoiceReady: voiceIndex.size > 1000,
    hmongVoiceSamples: voiceIndex.size,
    hmongVoicePath: hmongVoicePath(),
    spanishVoiceReady: true
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
  const cleanText = cleanSpeechText(text);
  if (hmongAudioCache.has(cleanText)) return hmongAudioCache.get(cleanText);

  const plan = createHmongSpeechPlan(cleanText);
  const clips = plan.tokens.map((token) => readWaveClip(getHmongSyllablePath(token)));
  const first = clips[0];
  const audioData = clips.slice(1).reduce((joined, clip) => {
    assertMatchingWaveFormat(first, clip);
    return crossfadePcm(joined, clip.data, first);
  }, Buffer.from(first.data));
  const audio = buildWaveFile(first, audioData);
  hmongAudioCache.set(cleanText, audio);
  if (hmongAudioCache.size > MAX_HMONG_CACHE_ITEMS) {
    hmongAudioCache.delete(hmongAudioCache.keys().next().value);
  }
  return audio;
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
  const overlapFrames = Math.min(Math.round(format.sampleRate * 0.018), maxFrames);
  if (overlapFrames < 2) return Buffer.concat([left, right]);

  const overlapBytes = overlapFrames * format.blockAlign;
  const leftBodyLength = left.length - overlapBytes;
  const output = Buffer.alloc(left.length + right.length - overlapBytes);
  left.copy(output, 0, 0, leftBodyLength);

  for (let frame = 0; frame < overlapFrames; frame += 1) {
    const rightWeight = frame / (overlapFrames - 1);
    for (let channel = 0; channel < format.channels; channel += 1) {
      const sampleOffset = frame * format.blockAlign + channel * 2;
      const leftSample = left.readInt16LE(leftBodyLength + sampleOffset);
      const rightSample = right.readInt16LE(sampleOffset);
      const blended = Math.round(leftSample * (1 - rightWeight) + rightSample * rightWeight);
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

export async function getSpanishSpeechAudio(text, fetchImpl = fetch) {
  const cleanText = cleanSpeechText(text);
  if (!cleanText) {
    const error = new Error("Speech text is required.");
    error.status = 400;
    throw error;
  }
  if (spanishAudioCache.has(cleanText)) return spanishAudioCache.get(cleanText);

  const url = new URL("https://translate.google.com/translate_tts");
  url.searchParams.set("ie", "UTF-8");
  url.searchParams.set("client", "tw-ob");
  url.searchParams.set("tl", "es-US");
  url.searchParams.set("q", cleanText);
  const response = await fetchImpl(url, {
    headers: {
      Accept: "audio/mpeg",
      "User-Agent": "Mozilla/5.0 ListeningHouseKiosk/1.0"
    },
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok || !String(response.headers.get("content-type") || "").includes("audio")) {
    const error = new Error("The Spanish speech service is temporarily unavailable.");
    error.status = 502;
    throw error;
  }
  const audio = Buffer.from(await response.arrayBuffer());
  spanishAudioCache.set(cleanText, audio);
  if (spanishAudioCache.size > MAX_SPANISH_CACHE_ITEMS) {
    spanishAudioCache.delete(spanishAudioCache.keys().next().value);
  }
  return audio;
}
