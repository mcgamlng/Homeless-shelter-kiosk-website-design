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
const audioDir = path.join(outputDir, "audio");
const finalVideoPath = path.join(outputDir, "listening-house-onboarding-walkthrough.mp4");
const speechScript = path.join(projectRoot, "scripts", "windows", "synthesize-narration.ps1");

const scenes = [
  {
    image: "01-kiosk-welcome.png",
    title: "1. Welcome: guests begin here",
    caption:
      "The portrait-friendly kiosk gives guests a calm first step. The interface is large, centered, touch-friendly, and designed for a shelter entrance.",
    duration: 10
  },
  {
    image: "02-name-entry.png",
    title: "2. Sign in or sign up by name",
    caption:
      "Guests enter only first and last name. New names are signed up automatically; saved names sign in, and repeat same-day check-ins are stopped here.",
    duration: 12
  },
  {
    image: "03-language-selection.png",
    title: "3. Choose a preferred language",
    caption:
      "English, Spanish, Hmong, and Somali are built into the guest flow. Every screen also includes a visible Read Aloud control.",
    duration: 10
  },
  {
    image: "04-hmong-activities.png",
    title: "4. Language accessibility",
    caption:
      "Guest instructions and activity names change with the selected language. The Hmong readout now joins syllables into smoother sentence-level speech.",
    duration: 13
  },
  {
    image: "05-activity-selection.png",
    title: "5. Choose today's support",
    caption:
      "Guests choose one or more available services. Administrators control service names, translations, icons, hours, limits, timers, and availability.",
    duration: 13
  },
  {
    image: "06-guest-confirmation.png",
    title: "6. A private guest confirmation",
    caption:
      "The guest is thanked and asked to wait for their name to be called. Staff schedule times remain private, and the kiosk resets automatically.",
    duration: 10
  },
  {
    image: "07-dashboard-action-center.png",
    title: "7. Who needs attention next",
    caption:
      "Staff see each guest's daily number, name, activity, status, scheduled start, and scheduled end. One tap updates Waiting, In Progress, Completed, or Skipped.",
    duration: 15
  },
  {
    image: "08-dashboard-calendar.png",
    title: "8. A calendar that reflects real time",
    caption:
      "Calendar blocks use their real duration. A 60-minute shower fills a full hour, a 45-minute laundry visit is shorter, and brief services stay compact.",
    duration: 15
  },
  {
    image: "09-calendar-detail.png",
    title: "9. Staff schedule controls",
    caption:
      "Selecting a calendar block reveals status, movement, exact-time, and guest-order controls. The schedule automatically protects guests from overlapping services.",
    duration: 14
  },
  {
    image: "10-tablet-alarm.png",
    title: "10. Tablet and phone timer alerts",
    caption:
      "Staff can enable timer alerts on a phone or tablet. The warning identifies the activity and guest, and the visible Stop Alarm button silences it immediately.",
    duration: 15
  },
  {
    image: "11-admin-activities.png",
    title: "11. Flexible activity administration",
    caption:
      "Each service can independently use calendar time, a daily quantity limit, a timer alert, available hours, monthly dates, yearly dates, or any combination.",
    duration: 15
  },
  {
    image: "12-admin-customization.png",
    title: "12. Customize the kiosk",
    caption:
      "The guided admin area changes the shelter name, guest-facing words, colors, and screen previews, allowing another shelter to adapt the same system.",
    duration: 14
  },
  {
    image: "13-admin-analytics.png",
    title: "13. Data and analytics",
    caption:
      "SQLite keeps daily guest and activity history. Staff can review names and service use, then export reports organized by day, week, month, or year.",
    duration: 14
  },
  {
    image: "14-about-qr.png",
    title: "14. Open or install on any device",
    caption:
      "The About page provides separate QR codes for a browser, iPhone or iPad installation, and the Android app. The configured server address stays consistent.",
    duration: 13
  },
  {
    image: "15-tablet-dashboard.png",
    title: "15. Built for the staff's working day",
    caption:
      "The responsive dashboard works on tablets, phones, laptops, and desktops while the Raspberry Pi provides lightweight local storage and live updates.",
    duration: 12
  }
];

function ensureDirectories() {
  fs.mkdirSync(outputDir, { recursive: true });
  fs.mkdirSync(clipDir, { recursive: true });
  fs.mkdirSync(captionDir, { recursive: true });
  fs.mkdirSync(audioDir, { recursive: true });
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

function createNarration(scene, index) {
  const prefix = String(index + 1).padStart(2, "0");
  const narrationPath = writeTextFile(`${prefix}-narration.txt`, scene.caption);
  const audioPath = path.join(audioDir, `${prefix}-narration.wav`);
  const result = spawnSync(
    "powershell",
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      speechScript,
      "-TextPath",
      narrationPath,
      "-OutputPath",
      audioPath,
      "-FfmpegPath",
      ffmpegPath,
      "-VoiceName",
      "en-GB-RyanNeural"
    ],
    {
      cwd: projectRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    }
  );
  if (result.status !== 0) {
    throw new Error(
      `Creating narration for ${scene.image} failed.\n\n${result.stderr || result.stdout || "No speech output."}`
    );
  }
  return audioPath;
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
  const audioPath = createNarration(scene, index);
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
      "-i",
      imagePath,
      "-i",
      audioPath,
      "-vf",
      filter,
      "-af",
      "apad=pad_dur=3",
      "-shortest",
      "-r",
      "2",
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-tune",
      "stillimage",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      clipPath
    ],
    `Creating clip ${scene.image}`
  );

  return clipPath;
}

function createStoryboard() {
  let elapsedSeconds = 0;
  const storyboard = [
    "# Shelter Check-In System Onboarding Video",
    "",
    "This editable storyboard matches `listening-house-onboarding-walkthrough.mp4`.",
    "",
    "| Scene | Time | Screen | On-screen message | Voiceover / explanation |",
    "| --- | --- | --- | --- | --- |"
  ];

  scenes.forEach((scene, index) => {
    const start = elapsedSeconds;
    elapsedSeconds += scene.duration;
    const formatTime = (seconds) =>
      `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
    storyboard.push(
      `| ${index + 1} | ${formatTime(start)}-${formatTime(elapsedSeconds)} | ${scene.image} | ${scene.title} | ${scene.caption} |`
    );
  });

  fs.writeFileSync(path.join(outputDir, "STORYBOARD.md"), `${storyboard.join("\n")}\n`, "utf8");

  const narration = [
    "# Narration Script",
    "",
    "This is the accessible transcript for the narrated walkthrough.",
    ""
  ];

  scenes.forEach((scene, index) => {
    narration.push(`## Scene ${index + 1}: ${scene.title}`);
    narration.push(scene.caption);
    narration.push(`Suggested voiceover window: ${scene.duration} seconds.`);
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
      "- `listening-house-onboarding-walkthrough.mp4`: captioned and narrated onboarding video",
      "- `STORYBOARD.md`: editable scene-by-scene plan",
      "- `NARRATION_SCRIPT.md`: voiceover script",
      "- `raw-screens/`: captured app screens used in the video",
      "- `clips/`: temporary video clips used to assemble the final MP4",
      "",
      "The walkthrough uses the same friendly British neural voice family preferred by the English kiosk readout.",
      "Each narrated scene includes a short pause so a presenter can stop and add commentary.",
      "",
      "Regenerate the video after refreshing the screenshots:",
      "",
      "```powershell",
      "py -m pip install edge-tts==7.2.8",
      "npm run onboarding:video",
      "```",
      ""
    ].join("\n"),
    "utf8"
  );
}

function createVideo() {
  ensureDirectories();
  if (!fs.existsSync(speechScript)) {
    throw new Error(`Missing narration helper: ${speechScript}`);
  }
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
