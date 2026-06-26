import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ffmpegPath from "ffmpeg-static";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.join(projectRoot, "onboarding-video");
const rawDir = path.join(outputDir, "raw-screens");
const clipDir = path.join(outputDir, "clips");
const captionDir = path.join(outputDir, "captions");
const finalVideoPath = path.join(outputDir, "listening-house-onboarding-walkthrough.mp4");

const scenes = [
  {
    image: "01-kiosk-welcome.png",
    title: "Welcome: guests begin here",
    caption:
      "The tabletop kiosk gives guests a calm first step. They begin with only the information the system needs: first and last name.",
    duration: 5
  },
  {
    image: "02-name-entry.png",
    title: "Sign in or sign up by name",
    caption:
      "New names are signed up automatically. Returning names are signed in, and duplicate same-day check-ins are stopped at this screen.",
    duration: 6
  },
  {
    image: "03-language.png",
    title: "Choose a preferred language",
    caption:
      "Guests choose the language they are most comfortable using. Common shelter service names translate automatically on the kiosk.",
    duration: 5
  },
  {
    image: "04-activities.png",
    title: "Choose today's support",
    caption:
      "Guests select one or more services, such as showers, meals, laundry, beds, private rooms, rest areas, or legal support.",
    duration: 6
  },
  {
    image: "05-confirmation.png",
    title: "Confirmation for the guest",
    caption:
      "The kiosk thanks the guest and asks them to wait for their name to be called. It does not show scheduled times to guests.",
    duration: 5
  },
  {
    image: "06-dashboard-calendar.png",
    title: "Staff dashboard calendar",
    caption:
      "The dashboard updates instantly on phones, tablets, laptops, and desktops on the same local network as the Raspberry Pi server.",
    duration: 6
  },
  {
    image: "07-dashboard-detail.png",
    title: "Staff manage progress",
    caption:
      "Staff can tap a guest activity block to see options, mark work waiting, in progress, completed, or skipped, and move schedule blocks.",
    duration: 6
  },
  {
    image: "08-admin-customization.png",
    title: "Admin customization",
    caption:
      "Admins can rename the kiosk, adjust guest-facing words, change colors, and preview each kiosk screen before saving.",
    duration: 6
  },
  {
    image: "09-admin-analytics.png",
    title: "Data and analytics",
    caption:
      "The system keeps daily name and activity history in SQLite, so staff can export reports by day, week, month, or year.",
    duration: 6
  },
  {
    image: "10-about.png",
    title: "Local network system",
    caption:
      "The Raspberry Pi acts as the local server. Other devices only need a browser and the same building Wi-Fi network.",
    duration: 6
  }
];

function ensureDirectories() {
  fs.mkdirSync(outputDir, { recursive: true });
  fs.mkdirSync(clipDir, { recursive: true });
  fs.mkdirSync(captionDir, { recursive: true });
}

function wrapText(text, width = 74) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = "";

  words.forEach((word) => {
    const next = line ? `${line} ${word}` : word;
    if (next.length > width && line) {
      lines.push(line);
      line = word;
      return;
    }
    line = next;
  });

  if (line) lines.push(line);
  return lines.join("\n");
}

function filterPath(filePath) {
  return filePath.replace(/\\/g, "/").replace(/:/g, "\\:");
}

function writeTextFile(filename, text) {
  const filePath = path.join(captionDir, filename);
  fs.writeFileSync(filePath, text, "utf8");
  return filePath;
}

function getFontPath() {
  const candidates = [
    "C:\\Windows\\Fonts\\segoeuib.ttf",
    "C:\\Windows\\Fonts\\segoeui.ttf",
    "C:\\Windows\\Fonts\\arialbd.ttf",
    "C:\\Windows\\Fonts\\arial.ttf"
  ];
  return candidates.find((candidate) => fs.existsSync(candidate));
}

function runFfmpeg(args, label) {
  const result = spawnSync(ffmpegPath, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });

  if (result.status !== 0) {
    throw new Error(
      `${label} failed.\n\n${result.stderr || result.stdout || "No encoder output."}`
    );
  }
}

function createClip(scene, index, fontPath) {
  const imagePath = path.join(rawDir, scene.image);
  if (!fs.existsSync(imagePath)) {
    throw new Error(`Missing captured screen: ${imagePath}`);
  }

  const titlePath = writeTextFile(`${String(index + 1).padStart(2, "0")}-title.txt`, scene.title);
  const captionPath = writeTextFile(
    `${String(index + 1).padStart(2, "0")}-caption.txt`,
    wrapText(scene.caption)
  );
  const clipPath = path.join(clipDir, `${String(index + 1).padStart(2, "0")}-${scene.image}.mp4`);

  const font = filterPath(fontPath);
  const titleFile = filterPath(titlePath);
  const captionFile = filterPath(captionPath);
  const filter = [
    "scale=1280:720:force_original_aspect_ratio=decrease",
    "pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=#8BC9C2",
    "drawbox=x=0:y=520:w=iw:h=200:color=black@0.76:t=fill",
    `drawtext=fontfile='${font}':textfile='${titleFile}':fontcolor=white:fontsize=34:x=48:y=545`,
    `drawtext=fontfile='${font}':textfile='${captionFile}':fontcolor=white:fontsize=25:x=48:y=596:line_spacing=8`
  ].join(",");

  runFfmpeg(
    [
      "-y",
      "-loop",
      "1",
      "-t",
      String(scene.duration),
      "-i",
      imagePath,
      "-vf",
      filter,
      "-r",
      "30",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      clipPath
    ],
    `Creating clip ${scene.image}`
  );

  return clipPath;
}

function createStoryboard() {
  const storyboard = [
    "# Shelter Check-In System Onboarding Video",
    "",
    "This editable storyboard matches `listening-house-onboarding-walkthrough.mp4`.",
    "",
    "| Scene | Screen | On-screen message | Voiceover / explanation |",
    "| --- | --- | --- | --- |"
  ];

  scenes.forEach((scene, index) => {
    storyboard.push(`| ${index + 1} | ${scene.image} | ${scene.title} | ${scene.caption} |`);
  });

  fs.writeFileSync(path.join(outputDir, "STORYBOARD.md"), `${storyboard.join("\n")}\n`, "utf8");

  const narration = [
    "# Narration Script",
    "",
    "Use this if you want to record a human voiceover later.",
    ""
  ];

  scenes.forEach((scene, index) => {
    narration.push(`## Scene ${index + 1}: ${scene.title}`);
    narration.push(scene.caption);
    narration.push("");
  });

  fs.writeFileSync(
    path.join(outputDir, "NARRATION_SCRIPT.md"),
    `${narration.join("\n")}\n`,
    "utf8"
  );

  fs.writeFileSync(
    path.join(outputDir, "README.md"),
    [
      "# Onboarding Video Package",
      "",
      "Files in this folder:",
      "",
      "- `listening-house-onboarding-walkthrough.mp4`: captioned onboarding video",
      "- `STORYBOARD.md`: editable scene-by-scene plan",
      "- `NARRATION_SCRIPT.md`: voiceover script",
      "- `raw-screens/`: captured app screens used in the video",
      "- `clips/`: temporary video clips used to assemble the final MP4",
      "",
      "Regenerate the video after refreshing the screenshots:",
      "",
      "```bash",
      "npm run onboarding:video",
      "```",
      ""
    ].join("\n"),
    "utf8"
  );
}

function createVideo() {
  ensureDirectories();
  const fontPath = getFontPath();
  if (!fontPath) throw new Error("Could not find a Windows font for video captions.");

  const clips = scenes.map((scene, index) => createClip(scene, index, fontPath));
  const concatPath = path.join(outputDir, "concat-list.txt");
  fs.writeFileSync(
    concatPath,
    clips.map((clip) => `file '${clip.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`).join("\n"),
    "utf8"
  );

  runFfmpeg(
    ["-y", "-f", "concat", "-safe", "0", "-i", concatPath, "-c", "copy", finalVideoPath],
    "Combining onboarding clips"
  );

  createStoryboard();
  console.log(`Created ${finalVideoPath}`);
}

createVideo();
