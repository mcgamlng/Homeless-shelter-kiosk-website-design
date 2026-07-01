import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataPath = path.join(projectRoot, "data");
const archivePath = path.join(dataPath, "Yuhalu_Voice.zip");
const installPath = path.join(dataPath, "hmong-voice");
const expectedVoicePath = path.join(installPath, "Kong");
const downloadUrl = "https://yuhalu.org/download.php?file=Yuhalu_Voice.zip";

function quotePowerShellLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

fs.mkdirSync(dataPath, { recursive: true });

if (!fs.existsSync(archivePath)) {
  console.log("Downloading the native Hmong voice pack...");
  const response = await fetch(downloadUrl, { signal: AbortSignal.timeout(10 * 60 * 1000) });
  if (!response.ok || !response.body) {
    throw new Error(`Hmong voice download failed with HTTP ${response.status}.`);
  }
  await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(archivePath));
}

fs.mkdirSync(installPath, { recursive: true });
const result =
  process.platform === "win32"
    ? spawnSync(
        "powershell",
        [
          "-NoProfile",
          "-Command",
          `Expand-Archive -LiteralPath ${quotePowerShellLiteral(
            archivePath
          )} -DestinationPath ${quotePowerShellLiteral(installPath)} -Force`
        ],
        { stdio: "inherit" }
      )
    : spawnSync("unzip", ["-o", archivePath, "-d", installPath], { stdio: "inherit" });

if (result.error) throw result.error;
if (result.status !== 0) {
  throw new Error(
    process.platform === "win32"
      ? "Hmong voice extraction failed."
      : "Hmong voice extraction failed. Install unzip and run this command again."
  );
}

if (!fs.existsSync(expectedVoicePath)) {
  throw new Error(`Hmong voice folder was not found at ${expectedVoicePath}.`);
}

const sampleCount = fs
  .readdirSync(expectedVoicePath)
  .filter((name) => name.endsWith(".wav")).length;
console.log(`Hmong voice ready: ${sampleCount} native speech samples installed.`);
