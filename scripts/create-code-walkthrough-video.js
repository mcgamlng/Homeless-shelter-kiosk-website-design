import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ffmpegPath from "ffmpeg-static";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.join(projectRoot, "code-walkthrough");
const generatedDir = path.join(outputDir, "generated");
const textDir = path.join(generatedDir, "text");
const audioDir = path.join(generatedDir, "audio");
const clipDir = path.join(generatedDir, "clips");
const videoPath = path.join(outputDir, "listening-house-code-walkthrough.mp4");
const narrationScript = path.join(outputDir, "NARRATION_SCRIPT.md");
const storyboardPath = path.join(outputDir, "STORYBOARD.md");
const speechScript = path.join(projectRoot, "scripts", "windows", "synthesize-narration.ps1");
const forceRebuild = process.argv.includes("--rebuild");

const scenes = [
  {
    section: "Orientation",
    title: "What this project is",
    bullets: [
      "One shelter system with a guest kiosk and staff tools.",
      "React draws the screens; Express runs the server.",
      "SQLite stores data; Socket.IO sends live updates.",
      "The Android app is a lightweight wrapper around the website."
    ],
    files: ["README.md", "package.json", "SYSTEM_GUIDE.md"],
    code: `Browser or app\n      |\n      v\nReact -> Express -> SQLite\n            |\n            v\n        Socket.IO`,
    narration:
      "Welcome to the Listening House guest check-in system code walkthrough. This video assumes you understand basic ideas such as files, functions, and variables, but it does not assume professional programming experience. The easiest way to understand the project is as one system with three main layers. React creates everything people see and touch in the browser. Express is the Node.js server that receives requests and applies the rules. SQLite is the local database file that remembers guests, activities, schedules, and settings. Socket.IO connects the server back to every open staff dashboard so changes appear immediately. The Android app does not duplicate the website. It opens the same staff dashboard and adds Android alarm and notification support."
  },
  {
    section: "Orientation",
    title: "The complete request journey",
    bullets: [
      "A guest action starts in a React page.",
      "The API helper sends JSON to an Express route.",
      "The repository validates and writes one transaction.",
      "Socket.IO broadcasts the refreshed dashboard."
    ],
    files: ["src/pages/Kiosk.jsx", "src/api.js", "server/index.js", "server/repository.js"],
    code: `Kiosk click\n  -> api.createCheckIn()\n  -> POST /api/check-ins\n  -> createCheckIn()\n  -> dashboard:update`,
    narration:
      "Here is the most important flow in the entire codebase. A guest presses a button in Kiosk dot J S X. That React component calls a function in src slash api dot J S. The API helper turns the information into JSON and sends it to a route such as post slash api slash check-ins. Server slash index dot J S receives the request and calls the repository. The repository checks the name, duplicate-day rules, activity availability, daily limits, and scheduling. It writes the check-in and activity requests inside a database transaction. A transaction means every related write succeeds together or none of them are saved. Finally, the server emits dashboard update through Socket.IO, and every connected staff screen receives the new state."
  },
  {
    section: "Orientation",
    title: "How the folders are organized",
    bullets: [
      "src contains browser and React code.",
      "server contains APIs, data rules, scheduling, and SQLite.",
      "shared contains logic used by both browser and server.",
      "mobile, scripts, tests, and docs support operation."
    ],
    files: ["src/", "server/", "shared/", "mobile/android/", "scripts/", "tests/"],
    code: `src/       user interface\nserver/    local backend\nshared/    shared rules\nmobile/    Android wrapper\nscripts/   setup tools\ntests/     automated checks`,
    narration:
      "The folder structure is intentionally direct. The src folder is the browser application. Pages, icons, translations, API calls, Socket.IO setup, and CSS live there. The server folder contains the Express server, database access, scheduler, translation and speech services, spreadsheet generator, and network detection. Shared contains small modules that must behave the same on both sides, such as kiosk customization validation and built-in activity translations. Mobile slash Android contains the native Java wrapper. Scripts contains startup installers, Raspberry Pi helpers, stress tests, demo data, and video generators. Tests contains Node's automated test files. Documentation at the project root explains deployment, capacity, public access, and architecture."
  },
  {
    section: "Tooling",
    title: "package.json and the technology choices",
    bullets: [
      "Dependencies are the libraries required at runtime.",
      "Scripts are repeatable commands for common jobs.",
      "The stack stays small enough for a 4 GB Raspberry Pi.",
      "Vite builds React into static production files."
    ],
    files: ["package.json", "vite.config.js"],
    code: `"scripts": {\n  "build": "vite build",\n  "start": "node server/index.js",\n  "test": "node --test"\n}`,
    narration:
      "Package dot JSON is the project control panel. The dependencies section lists the libraries the system needs. Express handles web requests. Better SQLite three talks to the database. React draws the interface. Socket.IO provides live updates. QR code creates installation codes. Lucide React provides consistent icons. Vite compiles the React source into the dist folder. The scripts section gives reliable commands. N P M run build creates production browser files. N P M start runs the real server. N P M test runs every automated test. Keeping these dependencies limited avoids a heavy framework, cloud database, or local artificial intelligence model, which helps the software run comfortably on a Raspberry Pi with four gigabytes of memory."
  },
  {
    section: "Frontend",
    title: "React startup, routes, and the shared shell",
    bullets: [
      "main.jsx attaches React to the HTML page.",
      "App.jsx chooses the page from the browser route.",
      "The shell loads settings and draws navigation.",
      "Staff routes pass through the PIN gate."
    ],
    files: ["src/main.jsx", "src/App.jsx", "index.html"],
    code: `<Routes>\n  <Route path="/kiosk" />\n  <Route path="/dashboard" />\n  <Route path="/admin" />\n  <Route path="/about" />\n</Routes>`,
    narration:
      "The browser starts in index dot HTML, which contains a single root element. Main dot J S X asks React to render the App component into that root. App dot J S X is the traffic director. React Router looks at the address, such as slash kiosk or slash dashboard, and renders the matching page. App also provides the shared header, navigation, saved customization settings, and staff protection. The kiosk keeps staff navigation hidden behind a small menu. Dashboard and Admin use the staff PIN gate. After a successful PIN request, the browser stores a temporary session token in session storage. That token is sent with protected API calls. Refreshing the page keeps the token, but restarting the server invalidates it because sessions live only in server memory."
  },
  {
    section: "Frontend",
    title: "The API helper and Socket.IO client",
    bullets: [
      "api.js keeps network calls in one place.",
      "Errors become readable JavaScript Error objects.",
      "socket.js creates one authenticated live connection.",
      "Pages stay focused on user-interface behavior."
    ],
    files: ["src/api.js", "src/socket.js"],
    code: `request("/api/dashboard", {\n  headers: {\n    Authorization: "Bearer " + token\n  }\n})`,
    narration:
      "Src slash api dot J S prevents every page from rewriting fetch logic. Each exported function knows its URL, method, request body, and whether it needs an admin token. The shared request helper converts JavaScript objects into JSON, checks the response status, reads error messages, and throws normal Error objects that React can display. Src slash socket dot J S creates the Socket.IO connection for the staff dashboard. It sends the same temporary staff token during the connection handshake. When the server sends dashboard update, the client replaces the dashboard data with the newest snapshot. Keeping normal requests and live connections in these two files makes the pages easier to read and makes server-address changes much safer."
  },
  {
    section: "Kiosk",
    title: "The guest kiosk state machine",
    bullets: [
      "One component moves through five named steps.",
      "React state holds temporary answers.",
      "Permanent data is saved only at final submission.",
      "The confirmation screen resets after ten seconds."
    ],
    files: ["src/pages/Kiosk.jsx"],
    code: `WELCOME -> IDENTITY\n  -> LANGUAGE\n  -> ACTIVITIES\n  -> CONFIRMATION`,
    narration:
      "Kiosk dot J S X behaves like a small state machine. A state machine means the interface can be in one clearly named step at a time. The steps are welcome, identity, language, activities, and confirmation. React state stores the current step, selected language, entered first and last name, selected activity identifiers, errors, and loading state. Moving backward changes the step without creating database records. The permanent check-in is created only when the guest submits activities. This prevents half-finished visits. The confirmation page intentionally hides staff schedule times and tells the guest to wait for their name. A ten-second timer returns the kiosk to the welcome screen if the guest does not press Finish, preparing it for the next person."
  },
  {
    section: "Kiosk",
    title: "Names, privacy, and duplicate prevention",
    bullets: [
      "Only first and last name are collected.",
      "A new name signs up; a saved name signs in.",
      "Duplicate same-day visits stop immediately.",
      "No medical notes or sensitive identity data are stored."
    ],
    files: ["src/pages/Kiosk.jsx", "server/repository.js", "server/schema.sql"],
    code: `prepareGuestForCheckIn()\nfindGuestByName()\nfindGuestCheckInForCurrentDay()\ncreateGuestProfile()`,
    narration:
      "The identity flow is deliberately minimal. The guest enters first and last name. The repository normalizes the values and searches for an existing guest using a case-insensitive comparison. If the name is new, the system creates a guest profile and labels the visit as a sign-up. If the name already exists, it reuses that guest identifier and labels the visit as a sign-in. Before the activity screen, inspectNameCheckIn checks whether the same guest already has a check-in in the current operating day. If so, the kiosk asks them to speak with staff. The database does not request email, phone number, birthdate, address, government identification, medical details, or private notes."
  },
  {
    section: "Languages",
    title: "Translations and custom activity names",
    bullets: [
      "i18n.js contains guest-interface wording.",
      "Saved activity translations travel with each request.",
      "A local dictionary handles common shelter terms.",
      "Unknown labels can use the online translator."
    ],
    files: ["src/i18n.js", "shared/activityTranslations.js", "server/translationService.js"],
    code: `translateActivityName(\n  activity,\n  selectedLanguage\n)`,
    narration:
      "The kiosk supports English, Spanish, Hmong, and Somali. Src slash i eighteen n dot J S stores interface phrases and helper functions for times and durations. Activity names are different because administrators can create them. Shared slash activity translations contains a local dictionary for common shelter vocabulary. When an administrator adds an unfamiliar English label, translation service first checks local terms and then requests an online translation for Spanish, Hmong, and Somali. Only the activity label is sent. Guest names and visit data are never sent to translation. The translated names are stored on the activity and copied into each scheduled item, so historical reports keep the wording that was used at check-in even if the activity is renamed later."
  },
  {
    section: "Languages",
    title: "Read-aloud architecture",
    bullets: [
      "English and Somali prefer installed system voices.",
      "Spanish uses online audio with a local fallback.",
      "Hmong uses native recorded syllables joined server-side.",
      "Each screen reads short, understandable segments."
    ],
    files: ["src/pages/Kiosk.jsx", "src/speechVoices.js", "server/speechService.js"],
    code: `buildReadoutSegments()\n  -> speech route\n  -> one audio sentence\n  -> pause between cards`,
    narration:
      "Read aloud uses a language-specific strategy because one voice system does not support every language well. English and Somali use the best matching voice installed on the device. Spanish requests smoother Spanish audio from the server and falls back to a local Spanish voice if the internet is unavailable. Hmong uses a separately installed native-recorded voice pack. Speech service converts numbers, finds the matching syllable recordings, trims isolated recording boundaries, blends them with an equal-power crossfade, and returns one continuous wave file for a complete sentence. The browser plays that sentence as one audio item. Activity cards still have a deliberate pause between cards so a listener can tell where one option ends and the next begins."
  },
  {
    section: "Dashboard",
    title: "Dashboard data and the new live clock",
    bullets: [
      "The dashboard loads once, then listens for live updates.",
      "One one-second timer drives clocks, countdowns, and alerts.",
      "The Staff Action Center shows the current local time.",
      "Daily person numbers show check-in order."
    ],
    files: ["src/pages/Dashboard.jsx", "src/socket.js"],
    code: `setInterval(() =>\n  setClockNow(Date.now()),\n  1000\n)`,
    narration:
      "Dashboard dot J S X first requests the complete protected dashboard snapshot. It then opens a Socket.IO connection and replaces that snapshot whenever the server broadcasts an update. The component already maintains clockNow, a timestamp refreshed every second. That single timer drives activity countdowns, starting-soon checks, and the live clock at the top of Who Needs Attention Next. Reusing it avoids another background timer. The clock uses the device's local time zone, displays hours, minutes, seconds, and the current date, and uses tabular numbers so changing digits do not shift the layout. The dashboard also receives a daily number calculated from check-in order, allowing staff to understand that Person One arrived before Person Two without exposing a permanent identity number."
  },
  {
    section: "Dashboard",
    title: "The Staff Action Center",
    bullets: [
      "Important work appears above the full calendar.",
      "Each row shows person, service, status, start, and end.",
      "Waiting, Start, Complete, and Skip update immediately.",
      "Plain-language timing explains overdue or upcoming work."
    ],
    files: ["src/pages/Dashboard.jsx", "src/staffAlerts.js"],
    code: `getStaffActionItems(items, now)\ndescribeActionTiming(item, now)\nupdateStatus(id, status)`,
    narration:
      "The Staff Action Center is a focused view of the calendar. StaffAlerts dot J S contains pure functions that decide which items need attention and describe the timing in plain language, such as in progress now, starts soon, or overdue. Keeping those calculations outside React makes them easy to test. Each action card shows the daily person number, guest name, activity, status, scheduled start, scheduled end, and four status controls. Pressing Start changes the item to In Progress and begins its operational countdown from the current time. Pressing Complete or Skip records the actual end time and asks the scheduler to move waiting work forward when possible. Socket.IO then sends the result to every other staff screen."
  },
  {
    section: "Dashboard",
    title: "How the time calendar is drawn",
    bullets: [
      "Each activity is a vertical lane.",
      "Minutes become pixels using one shared scale.",
      "Block height equals the actual scheduled duration.",
      "Short blocks collapse labels but remain selectable."
    ],
    files: ["src/pages/Dashboard.jsx", "src/styles.css", "src/utils.js"],
    code: `top = minutesFromStart * 3.1\nheight = durationMinutes * 3.1`,
    narration:
      "The desktop and tablet calendar is a visual time map. Every active timed activity becomes a vertical lane. Utility functions calculate the number of minutes between the workday start and an appointment. Dashboard multiplies those minutes by three point one pixels to calculate the block's top position. It uses the same scale for height, so a sixty-minute appointment is exactly twice as tall as a thirty-minute appointment. Very short activities use compact CSS classes that hide text which cannot fit, while preserving the person number and click target. Opening a block reveals movement and status controls. The phone layout uses simpler cards because a full horizontal day calendar would be difficult to operate on a narrow screen."
  },
  {
    section: "Scheduling",
    title: "Automatic earliest-gap scheduling",
    bullets: [
      "The scheduler evaluates every remaining selected activity.",
      "It chooses the earliest legal open lane.",
      "The same guest never overlaps themselves.",
      "Activity hours, check-in time, buffers, and closing still apply."
    ],
    files: ["server/scheduler.js"],
    code: `while (remaining.length) {\n  findEarliestSlot(...)\n  choose earliest candidate\n  reserve its time\n}`,
    narration:
      "Server slash scheduler dot J S contains the most specialized business logic. ScheduleActivities receives the selected activities, guest identifier, existing appointments, buffer setting, current time, and workday settings. It separates timed from untimed services. For each remaining timed activity, it calls findEarliestSlot. That function checks the activity lane and the same guest's appointments. ScheduleActivities compares the candidate openings and chooses the earliest legal one rather than blindly preserving selection order. This allows a guest to use an open private room while the legal-support lane is occupied. After reserving that slot, it repeats for the guest's remaining services. The result obeys activity-specific hours, the overall workday, the guest's check-in time, duration, and the configured buffer."
  },
  {
    section: "Scheduling",
    title: "Manual moves and schedule repair",
    bullets: [
      "Staff can move a block earlier, later, or to an exact time.",
      "A moved item acts as the pinned appointment.",
      "Conflicting waiting work is repaired around it.",
      "Manual guest ordering can preserve a requested sequence."
    ],
    files: ["server/scheduler.js", "server/repository.js", "src/pages/Dashboard.jsx"],
    code: `repairScheduleAfterMove({\n  itemId,\n  targetStart,\n  items,\n  settings\n})`,
    narration:
      "Automatic scheduling is only the starting point. Staff can move a block five minutes earlier or later, enter an exact time, drag it, or reorder one guest's services. The server never trusts the browser to enforce the rules. RepairScheduleAfterMove rounds the requested time to five minutes, verifies it is not in the past or before check-in, verifies the activity is open, and makes the selected block the pinned appointment. It then rebuilds affected waiting appointments around that choice while protecting lane conflicts and same-guest buffers. ReorderCheckInItems calls scheduleActivities with preserveOrder enabled, which means an explicit staff sequence is treated differently from the automatic earliest-gap order."
  },
  {
    section: "Scheduling",
    title: "Completion, skipping, and compaction",
    bullets: [
      "Complete or Skip ends a timed item at the current moment.",
      "In Progress items remain fixed.",
      "Waiting items are reconsidered from the new open time.",
      "Items never move past their allowed closing boundary."
    ],
    files: ["server/scheduler.js", "server/repository.js"],
    code: `compactScheduleAfterFinalStatus()\n  -> rebalanceWaitingSchedule()\n  -> update waiting rows`,
    narration:
      "When staff completes or skips a timed activity, the saved end time becomes the moment the button was pressed. CompactScheduleAfterFinalStatus changes that item to a final status and calls rebalanceWaitingSchedule. Completed and skipped work remains historical. In Progress work remains fixed because a guest is already using that service. Waiting work is compared again and placed into the earliest available legal gaps after the current moment. The rebalancer will not move an item past the workday end or its own activity closing time. If the remaining day cannot hold every appointment, the repository does not partially rewrite the schedule. This all-or-nothing behavior avoids a confusing half-compacted calendar."
  },
  {
    section: "Admin",
    title: "Activity configuration",
    bullets: [
      "Every activity stores independent operational rules.",
      "Calendar time, quantity, alarm, hours, month, and year can combine.",
      "Icons and translations are saved with the definition.",
      "Deleting an activity preserves old scheduled history."
    ],
    files: ["src/pages/Admin.jsx", "server/repository.js", "server/schema.sql"],
    code: `time_limit_enabled\ndaily_limit_enabled\nalarm_enabled\navailability_window_enabled\nmonthly_window_enabled\nyearly_window_enabled`,
    narration:
      "Admin dot J S X contains the largest form because each shelter service can behave differently. Calendar time controls whether the service receives a scheduled block and duration. Daily quantity limits control how many requests can be accepted. Staff timer alerts control ending warnings. Available hours restrict the service inside the workday. Monthly and yearly windows handle repeating availability. These switches are independent, so an activity can use any combination. The icon picker stores a simple icon name, not an image upload. English and translated names are editable. When an activity is deleted, the repository first removes the live foreign-key reference from existing scheduled items, then deletes the definition. The copied historical activity name remains in old visit records."
  },
  {
    section: "Admin",
    title: "Kiosk customization and network settings",
    bullets: [
      "Text and color settings are data, not hard-coded forks.",
      "Shared validation prevents unsafe CSS values.",
      "The preview walks through every kiosk screen.",
      "Network settings choose local Wi-Fi or a public HTTPS address."
    ],
    files: ["src/pages/Admin.jsx", "shared/kioskCustomization.js", "server/network.js"],
    code: `settings {\n  kiosk_welcome_title,\n  kiosk_background_color,\n  network_mode,\n  preferred_local_url\n}`,
    narration:
      "Kiosk customization is stored in the settings table. Administrators can change the shelter name, system label, welcome text, helper text, confirmation wording, button text, and color values. Shared slash kiosk customization defines defaults, allowed keys, and color validation used by both server and browser. This prevents arbitrary CSS from being inserted. The Admin preview is a carousel that renders the five guest steps using the unsaved form values, so staff can review changes before saving. Network and Phone Access is separate. Server slash network detects local addresses, validates the chosen base URL, and decides whether QR codes should use local Wi-Fi or a configured public H T T P S address."
  },
  {
    section: "Reporting",
    title: "Analytics and spreadsheet exports",
    bullets: [
      "Reports use a requested day, week, month, or year.",
      "Local calendar boundaries are converted to UTC for SQLite.",
      "People, visits, activities, and daily summaries are grouped.",
      "xlsx.js builds a real workbook without Microsoft Excel."
    ],
    files: ["server/repository.js", "server/xlsx.js", "src/pages/Admin.jsx"],
    code: `getAnalyticsReport({ period, date })\ncreateAnalyticsWorkbook(...)\ncreateWorkbookBuffer(sheets)`,
    narration:
      "Analytics begins with the exact requested local date and period. GetReportBounds calculates local start and end moments for a day, week, month, or year. Those boundaries are converted to U T C timestamp strings before querying SQLite, because SQLite's current timestamp is stored in U T C. Results are converted back to local dates for display. The repository groups check-ins, unique guests, new and returning visits, requested activities, statuses, and daily totals. It also builds a People section with each person's visit dates and requested services. Server slash xlsx dot J S creates the workbook package directly using lightweight code. Microsoft Excel does not need to be installed on the Raspberry Pi."
  },
  {
    section: "Server",
    title: "Express routes and error handling",
    bullets: [
      "server/index.js is the HTTP entry point.",
      "Routes validate access, call repository functions, and return JSON.",
      "handleRoute converts thrown errors into safe responses.",
      "The production server also serves the built React files."
    ],
    files: ["server/index.js"],
    code: `app.post("/api/check-ins",\n  handleRoute((req, res) => {\n    const result = createCheckIn(req.body)\n    emitDashboard()\n    res.json(result)\n  })\n)`,
    narration:
      "Server slash index dot J S creates the Express application and the HTTP server. Routes are intentionally thin. They read request values, require an admin session when necessary, call a repository or service function, emit a dashboard update after a change, and return JSON or a file. HandleRoute catches errors from synchronous and asynchronous handlers and returns the error's status code and readable message without exposing an internal stack trace. Express JSON is limited to two hundred fifty-six kilobytes because the application has no reason to accept large uploads. After all API routes, the server serves the dist folder created by Vite. Unknown browser routes return index dot HTML so React Router can open pages directly."
  },
  {
    section: "Server",
    title: "The repository as the business boundary",
    bullets: [
      "repository.js owns database reads and writes.",
      "It combines validation, scheduling, and transactions.",
      "Pages never run SQL directly.",
      "Returned objects are shaped for the user interface."
    ],
    files: ["server/repository.js"],
    code: `createCheckIn()\ngetDashboardData()\nupdateScheduledItemStatus()\ngetAnalyticsReport()\nresetDailyData()`,
    narration:
      "Repository dot J S is the main business boundary and therefore one of the most important files to understand. It is the only place that should know both application rules and detailed SQL queries. CreateCheckIn prepares the guest, validates activities, schedules timed work, inserts every row, rebalances waiting work, and returns the completed visit. GetDashboardData joins guests, visits, and scheduled items and adds daily person numbers. UpdateScheduledItemStatus applies status-specific scheduling behavior and writes status history. GetAnalyticsReport creates grouped historical data. ResetDailyData clears the live day without deleting history. Keeping this logic out of React prevents a phone or modified browser from bypassing important rules."
  },
  {
    section: "Database",
    title: "Opening SQLite, migrations, and WAL mode",
    bullets: [
      "db.js opens one persistent database file.",
      "schema.sql describes the current clean schema.",
      "Migrations add or rebuild fields for older installations.",
      "WAL mode improves simultaneous reads and writes."
    ],
    files: ["server/db.js", "server/schema.sql", ".env.example"],
    code: `DATABASE_PATH=./data/listening-house.sqlite\n\nPRAGMA journal_mode = WAL;\nPRAGMA foreign_keys = ON;`,
    narration:
      "Server slash db dot J S opens the file configured by DATABASE_PATH. If the folder does not exist, startup creates it. Schema dot S Q L describes the tables for a new installation. Existing Raspberry Pis may have an older database, so db dot J S also inspects columns, adds missing fields, and rebuilds tables when a structural migration is necessary. Foreign keys protect relationships between records. Write-ahead logging, usually called WAL mode, lets staff dashboards read while the kiosk writes, with less blocking than SQLite's older journal mode. Indexes on guest names, statuses, check-in identifiers, and schedule times make common queries fast. The database file and its WAL companion files are ignored by Git because real shelter data must never be published."
  },
  {
    section: "Database",
    title: "What each database table means",
    bullets: [
      "guests is the reusable first-and-last-name identity.",
      "check_ins is one visit on one operating day.",
      "scheduled_activity_items is one requested service.",
      "activities, settings, and status_history support operations."
    ],
    files: ["server/schema.sql"],
    code: `guests 1 --- many check_ins\ncheck_ins 1 --- many items\nactivities 1 --- many items\nitems 1 --- many status_history`,
    narration:
      "The guests table stores one reusable identity with first name, last name, and timestamps. Check ins stores visits and points back to a guest. It records sign-up versus returning sign-in, language, status, and visit times. Scheduled activity items stores one requested service for one check-in. It copies activity names, translations, duration, availability rules, alarm settings, schedule times, and status so history remains understandable after Admin changes. Activities stores the current service definitions. Status history records transitions for auditing. Settings stores workday rules, kiosk customization, network choices, daily rollover markers, and the hashed administrator PIN. The design avoids a large personal profile and keeps operational history separate from current configuration."
  },
  {
    section: "Operating Day",
    title: "Daily rollover and historical preservation",
    bullets: [
      "The first relevant request checks the saved day marker.",
      "Old active visits become cleared after the local date changes.",
      "Historical visits and activity items remain for analytics.",
      "Manual reset creates a new live-day boundary immediately."
    ],
    files: ["server/repository.js", "tests/reset-day.test.js"],
    code: `ensureCurrentDashboardDay()\nsetCurrentDashboardDayStart()\nresetDailyData()\ngetCurrentDashboardDayContext()`,
    narration:
      "The operating day is not implemented by deleting records. EnsureCurrentDashboardDay compares a saved marker with the current local calendar day. After midnight, old active check-ins are changed to cleared and a new marker is stored. The guest list, check-ins, scheduled items, and status history remain available to reporting. A manual New Day Reset creates an immediate boundary even on the same calendar date by recording the highest previous check-in identifier. Live dashboard queries use the date marker or identifier floor to exclude earlier work. Analytics deliberately ignores that live boundary and queries historical timestamps. Automated tests verify that a reset returns active totals to zero and that the next guest becomes Person One."
  },
  {
    section: "Security",
    title: "Admin sessions, PIN storage, and privacy",
    bullets: [
      "The PIN is hashed with PBKDF2 and a random salt.",
      "Successful login returns a temporary in-memory token.",
      "Protected HTTP and Socket.IO requests require that token.",
      "The system is local security, not an internet identity platform."
    ],
    files: ["server/repository.js", "server/index.js", "src/App.jsx"],
    code: `PBKDF2(pin, salt, 100000)\n\nAuthorization:\n  Bearer <temporary token>`,
    narration:
      "The administrator PIN is never stored as readable text after it is changed. Repository uses P B K D F two with a random salt and one hundred thousand iterations, then stores the resulting hash in settings. When staff enters the correct PIN, server index creates a random session token and stores it in an in-memory map. Protected HTTP routes require that token in the Authorization header. Socket.IO checks it during the connection handshake. Restarting the server clears all sessions, which requires staff to unlock again. This is appropriate for a local prototype, but it is not a full public identity system with user accounts, role management, password recovery, audit administrators, or multi-factor authentication."
  },
  {
    section: "Live Updates",
    title: "Socket.IO and synchronized staff screens",
    bullets: [
      "The server broadcasts one complete dashboard snapshot.",
      "Every authorized dashboard replaces its local state.",
      "Status, schedule, reset, and check-in changes share one path.",
      "Reconnect behavior is handled by the Socket.IO client."
    ],
    files: ["server/index.js", "src/socket.js", "src/pages/Dashboard.jsx"],
    code: `io.emit(\n  "dashboard:update",\n  getDashboardData()\n)`,
    narration:
      "Real-time synchronization uses a simple snapshot model. After a check-in, status change, schedule move, activity update, or reset, emitDashboard calls getDashboardData and broadcasts the complete current dashboard. Every authorized browser receives dashboard update and replaces its React state. A snapshot is slightly larger than sending tiny patches, but the daily data set is small and the logic is much easier to reason about. Phones cannot miss a dependent patch and end up with inconsistent state. Socket.IO also handles reconnect attempts when Wi-Fi briefly disconnects. Authentication happens before the connection is accepted, so the kiosk does not receive staff dashboard data."
  },
  {
    section: "Alarms",
    title: "Browser alarms and the Stop Alarm path",
    bullets: [
      "Staff explicitly enables alerts on each device.",
      "Starting-soon and ending warnings use schedule data.",
      "Sound and vibration repeat only while an alert is active.",
      "Stop Alarm cancels every browser and native signal."
    ],
    files: ["src/pages/Dashboard.jsx", "src/staffAlerts.js", "public/sw.js"],
    code: `setAlerts(...)\nplayAlarmTone()\nnavigator.vibrate(...)\nnotification.close()\ndismissedAlarmItems.add(id)`,
    narration:
      "Browser alarms are opt-in because browsers require a user gesture before sound and notifications. When staff enables alerts, Dashboard checks waiting activities for starting-soon reminders and In Progress activities for their configured ending threshold. An active ending alert is stored in React state. A separate effect repeats sound and vibration while at least one alert exists. The visible Stop Alarm button removes the alert, stops vibration, closes the notification, records the occurrence as dismissed, and tells the Android bridge to cancel its native alarm. The dismissed set prevents the one-second checker from immediately recreating the same warning. Wake Lock is requested when supported so an actively used staff screen does not sleep."
  },
  {
    section: "Android",
    title: "The Android wrapper and native alarms",
    bullets: [
      "MainActivity hosts a WebView pointed at the server.",
      "A custom URL saves or changes the server address.",
      "JavaScript bridge methods schedule Android alarms.",
      "AlarmManager and notifications work beyond the web page."
    ],
    files: [
      "mobile/android/app/src/main/java/org/listeninghouse/checkin/MainActivity.java",
      "mobile/android/app/src/main/java/org/listeninghouse/checkin/ActivityAlarmScheduler.java",
      "mobile/android/app/src/main/AndroidManifest.xml"
    ],
    code: `WebView -> dashboard URL\nLHCheckIn.syncActivityAlarms(...)\nAlarmManager -> Receiver\nReceiver -> Notification`,
    narration:
      "The Android application is intentionally small. MainActivity creates a WebView, which is Android's embedded browser, and loads the configured dashboard URL. It remembers that address so the app can reconnect after restarts or network changes. The custom L H check-in URL lets the Admin page configure the installed app with one tap. A JavaScript interface named L H CheckIn exposes carefully limited native methods to the website. Dashboard sends upcoming start and ending alarms through that bridge. ActivityAlarmScheduler uses Android AlarmManager, and ActivityAlarmReceiver creates a system notification when the alarm fires. The notification includes a Stop Alarm action. The manifest declares internet, notification, vibration, wake, and exact-alarm permissions."
  },
  {
    section: "Networking",
    title: "Local Wi-Fi and public access",
    bullets: [
      "The Raspberry Pi or laptop is the server.",
      "Local devices use its LAN address on the same Wi-Fi.",
      "A public HTTPS URL can replace the local address.",
      "QR codes always use the selected base address."
    ],
    files: ["server/network.js", "PUBLIC_ACCESS.md", "src/pages/About.jsx"],
    code: `local:\nhttp://192.168.x.x:3000\n\npublic:\nhttps://your-host.example`,
    narration:
      "In local mode, Node listens on zero point zero point zero point zero, which means other devices can reach the server through the computer or Raspberry Pi's network address. Phones must use the same Wi-Fi and that Wi-Fi must allow devices to communicate with each other. The Windows firewall helper opens the application port. Raspberry Pi dot local may work through multicast D N S, while the numeric local address is the fallback. In public mode, PUBLIC_URL or Admin's public address becomes the base URL. The documented Cloudflare Tunnel option provides H T T P S without opening a router port. Access Info and the About page build browser, iPhone, Android download, and Android configuration links from the chosen base."
  },
  {
    section: "Startup",
    title: "Manual startup and automatic boot",
    bullets: [
      "Manual operation is build once, then npm start.",
      "Windows Task Scheduler launches the hidden server and kiosk.",
      "Raspberry Pi systemd keeps the server running.",
      "Chromium kiosk mode opens the guest page full screen."
    ],
    files: [
      "scripts/windows/start-listening-house-kiosk.ps1",
      "scripts/raspberry-pi/install-autostart.sh",
      "RASPBERRY_PI_DEPLOYMENT.md"
    ],
    code: `npm run build\nnpm start\n\nchromium-browser --kiosk \n  http://localhost:3000/kiosk`,
    narration:
      "The manual startup path is simple. Install dependencies once, run N P M run build after code changes, and run N P M start to launch the production server. On Windows, the startup installer creates a Task Scheduler entry. Its PowerShell launcher starts Node in the project folder, waits for the health endpoint, and opens Chrome or Edge in kiosk mode. On Raspberry Pi, the installer creates a systemd service. Systemd starts the Node server at boot and can restart it after a failure. A desktop autostart file launches Chromium with the kiosk URL and full-screen flags. The server must be running for the kiosk, dashboard, QR links, and Android app to work."
  },
  {
    section: "Testing",
    title: "Automated tests and stress tests",
    bullets: [
      "Node test covers rules without opening a browser.",
      "Scheduler tests use fixed dates for repeatable results.",
      "Storage and live-day scripts measure Raspberry Pi capacity.",
      "Rendered browser QA checks layout and interaction."
    ],
    files: ["tests/", "scripts/stress-test-storage.js", "scripts/stress-test-live-day.js"],
    code: `npm test\nnpm run format:check\nnpm run build\nnpm run stress:storage\nnpm run stress:live`,
    narration:
      "The project uses Node's built-in test runner. Repository tests create temporary SQLite databases and verify names, limits, translations, resets, analytics, and spreadsheet contents. Scheduler tests use fixed dates so results do not depend on the current clock. Pure frontend helper tests verify translations, voices, alerts, networking, and icons. Stress test storage creates a large historical data set and measures file size and report time. Stress test live day measures heavy same-day scheduling. A production build catches module and JSX errors. Formatting prevents accidental style drift. Finally, rendered browser checks are still necessary for responsive layout, clipping, visible controls, and interactions such as the live clock changing every second."
  },
  {
    section: "Capacity",
    title: "Why SQLite fits the Raspberry Pi",
    bullets: [
      "Records are small text and number rows, not media files.",
      "Indexes keep common daily queries fast.",
      "Historical data is retained instead of reset.",
      "Backups copy one main database file while the server is stopped."
    ],
    files: ["PERFORMANCE_AND_CAPACITY.md", "server/db.js"],
    code: `guest + visit + activity rows\n= usually a few kilobytes\n\nNo photos\nNo video\nNo local AI model`,
    narration:
      "An eight-gigabyte Raspberry Pi has far more memory than this application normally needs. The important storage limit is the disk, not RAM. Each guest, visit, and activity request is a small database row. The application does not store photos, video, scanned identification, or artificial intelligence models. SQLite reads only the rows required for a dashboard or report, and indexes reduce scanning. Historical data does not need routine deletion. Performance and Capacity documents measured storage and report behavior. A shelter should still create regular backups. The safest simple backup is to stop the service, copy data slash listening-house dot sqlite to protected storage, and restart the service."
  },
  {
    section: "Deployment",
    title: "Build, deploy, and update safely",
    bullets: [
      "Source files are edited; dist is generated.",
      "Run tests and build before restarting production.",
      "Database migrations run automatically at server startup.",
      "Back up real data before major updates."
    ],
    files: ["README.md", "RASPBERRY_PI_DEPLOYMENT.md", "server/db.js"],
    code: `git pull\nnpm install\nnpm test\nnpm run build\nsudo systemctl restart \\\n  listening-house-kiosk`,
    narration:
      "A safe update changes source files, not generated dist files. First back up the database. Pull the new Git commit. Run N P M install if package files changed. Run tests and the formatting check. Run N P M run build to regenerate the browser bundle. Restart the Node service. On startup, db dot J S applies compatible migrations to the existing SQLite file. Open the health endpoint, kiosk, dashboard, and Admin page, then test one non-sensitive check-in. The Android app usually does not need rebuilding for website-only changes because it loads the live website. Rebuild the A P K when native Java, permissions, icons, or app connection behavior changes."
  },
  {
    section: "Open Source",
    title: "GitHub, the MIT license, and excluded data",
    bullets: [
      "Git tracks source, tests, and documentation.",
      "MIT permits reuse with the license notice.",
      ".gitignore excludes databases, secrets, builds, and APK binaries.",
      "Third-party voice assets keep their own license."
    ],
    files: [".gitignore", "LICENSE", "THIRD_PARTY_NOTICES.md", ".env.example"],
    code: `Commit:\n  source + tests + docs\n\nNever commit:\n  .env\n  data/*.sqlite\n  real guest information`,
    narration:
      "The GitHub repository is the shareable source, not the live shelter data. The MIT license allows people to use, modify, and redistribute the project while keeping the copyright and license notice. Gitignore excludes node modules, production builds, environment secrets, SQLite data, Android build folders, A P K binaries, and generated videos. Dot env example shows the names of settings without publishing real values. The Hmong voice pack is downloaded separately and follows Yuhalu's non-commercial terms, documented in Third Party Notices. Before every push, inspect Git status and the staged diff. Never publish a real database, guest list, administrator secret, tunnel token, Wi-Fi password, or private operational report."
  },
  {
    section: "Maintenance",
    title: "How to trace and change a feature",
    bullets: [
      "Start at the visible page component.",
      "Follow its API call to the Express route.",
      "Follow the route into repository or scheduler logic.",
      "Update tests and documentation with the behavior."
    ],
    files: ["src/pages/", "src/api.js", "server/index.js", "server/repository.js", "tests/"],
    code: `UI label\n -> event handler\n -> api function\n -> route\n -> repository\n -> database\n -> response`,
    narration:
      "When changing a feature, trace one complete path instead of searching randomly. Start with the visible text or control in a page component. Find its click or change handler. Follow the API function it calls. Find the matching Express route. Follow that route into repository, scheduler, network, speech, or translation logic. Identify the database tables or settings involved. Then follow the returned data back to React. Add or update a focused automated test for the rule. Build the project and verify the rendered interface at desktop and phone sizes. Update README or System Guide when the operational behavior changes. This path keeps frontend appearance, server enforcement, stored data, and documentation aligned."
  },
  {
    section: "Maintenance",
    title: "A practical debugging map",
    bullets: [
      "Blank page: inspect browser errors and rebuild dist.",
      "API error: inspect the route and repository message.",
      "Old data: check daily marker, database path, and server process.",
      "Phone failure: check URL, Wi-Fi isolation, firewall, and HTTPS mode."
    ],
    files: ["server/index.js", "server/network.js", "src/api.js", "README.md"],
    code: `GET /api/health\nGET /api/access-info\nGET /api/speech/status\n\nThen inspect browser console`,
    narration:
      "For a blank page, confirm the server health endpoint, rebuild dist, and inspect browser console errors. For a readable red or warning message, locate the matching API route and repository validation. If old guests appear, confirm the server is using the expected DATABASE_PATH and that the operating-day marker rolled over. If changes disappear after restart, confirm the correct database file and that the update was saved through the API. For phone failures, open Access Info, verify the server address, make sure the phone and server share a non-isolated Wi-Fi network, and check the firewall. For public access, verify the H T T P S tunnel and PUBLIC_URL. Speech Status confirms whether the Hmong voice pack is installed."
  },
  {
    section: "Summary",
    title: "The mental model to remember",
    bullets: [
      "React asks; Express receives; repository decides.",
      "Scheduler places; SQLite remembers; Socket.IO announces.",
      "Admin changes data-driven rules instead of forking code.",
      "Tests, backups, and documentation make updates dependable."
    ],
    files: ["SYSTEM_GUIDE.md", "README.md", "tests/"],
    code: `React asks\nExpress receives\nRepository decides\nScheduler places\nSQLite remembers\nSocket.IO announces`,
    narration:
      "The entire system can be remembered in one sentence. React asks, Express receives, the repository decides, the scheduler places, SQLite remembers, and Socket.IO announces. The kiosk and staff tools are two views of the same server. Admin settings make activities, wording, colors, network addresses, and operational limits data-driven, so another shelter can adapt the system without rewriting its architecture. Privacy comes from collecting little information and keeping the database local. Reliability comes from transactions, daily rollover, tests, automatic startup, and backups. When you need more detail, start with System Guide for architecture, README for operation, deployment documents for installation, and the test files for concrete examples of the rules."
  }
];

function ensureDirectories() {
  for (const directory of [outputDir, generatedDir, textDir, audioDir, clipDir]) {
    fs.mkdirSync(directory, { recursive: true });
  }
}

function wrapText(text, width) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > width && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.join("\n");
}

function writeText(filename, value) {
  const target = path.join(textDir, filename);
  fs.writeFileSync(target, value, "utf8");
  return target;
}

function filterPath(filePath) {
  return filePath.replace(/\\/g, "/").replace(/:/g, "\\:");
}

function getFontPath(candidates) {
  return candidates.find((candidate) => fs.existsSync(candidate));
}

function run(command, args, label) {
  let result;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    result = spawnSync(command, args, {
      cwd: projectRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    });
    if (result.status === 0) return result;
    const output = result.stderr || result.stdout || "No output.";
    if (!/permission denied/i.test(output) || attempt === 4) {
      throw new Error(`${label} failed.\n${output}`);
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, attempt * 750);
  }
  return result;
}

function createNarration(scene, index) {
  const prefix = String(index + 1).padStart(2, "0");
  const narrationTextPath = writeText(`${prefix}-narration.txt`, scene.narration);
  const audioPath = path.join(audioDir, `${prefix}-narration.wav`);
  run(
    "powershell",
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      speechScript,
      "-TextPath",
      narrationTextPath,
      "-OutputPath",
      audioPath
    ],
    `Narration for scene ${index + 1}`
  );
  return audioPath;
}

function createClip(scene, index, fonts) {
  const prefix = String(index + 1).padStart(2, "0");
  const clipPath = path.join(clipDir, `${prefix}.mp4`);
  if (!forceRebuild && fs.existsSync(clipPath) && fs.statSync(clipPath).size > 10_000) {
    console.log(`Reusing scene ${index + 1}/${scenes.length}: ${scene.title}`);
    return clipPath;
  }
  const body = scene.bullets.map((bullet) => `• ${wrapText(bullet, 49)}`).join("\n");
  const files = wrapText(scene.files.join("  |  "), 68);
  const sectionPath = writeText(`${prefix}-section.txt`, scene.section.toUpperCase());
  const titlePath = writeText(`${prefix}-title.txt`, scene.title);
  const bodyPath = writeText(`${prefix}-body.txt`, body);
  const filesPath = writeText(`${prefix}-files.txt`, files);
  const codePath = writeText(`${prefix}-code.txt`, scene.code);
  const audioPath = createNarration(scene, index);

  const regular = filterPath(fonts.regular);
  const bold = filterPath(fonts.bold);
  const mono = filterPath(fonts.mono);
  const draw = [
    "drawbox=x=0:y=0:w=1280:h=720:color=#eaf4f1:t=fill",
    "drawbox=x=0:y=0:w=1280:h=104:color=#22356d:t=fill",
    "drawbox=x=0:y=104:w=16:h=546:color=#9b6baa:t=fill",
    "drawbox=x=34:y=132:w=740:h=500:color=#fffdf7:t=fill",
    "drawbox=x=804:y=132:w=442:h=500:color=#202020:t=fill",
    "drawbox=x=0:y=650:w=1280:h=70:color=#202020:t=fill",
    `drawtext=fontfile='${bold}':textfile='${filterPath(sectionPath)}':fontcolor=#a7d2cd:fontsize=16:x=38:y=18`,
    `drawtext=fontfile='${bold}':textfile='${filterPath(titlePath)}':fontcolor=white:fontsize=36:x=38:y=47`,
    `drawtext=fontfile='${bold}':text='WHAT THIS PART DOES':fontcolor=#9b6baa:fontsize=17:x=58:y=156`,
    `drawtext=fontfile='${regular}':textfile='${filterPath(bodyPath)}':fontcolor=#2d2d2a:fontsize=21:x=58:y=195:line_spacing=6`,
    `drawtext=fontfile='${bold}':text='KEY FILES':fontcolor=#9b6baa:fontsize=17:x=58:y=544`,
    `drawtext=fontfile='${regular}':textfile='${filterPath(filesPath)}':fontcolor=#22356d:fontsize=17:x=58:y=578:line_spacing=6`,
    `drawtext=fontfile='${bold}':text='CODE MAP':fontcolor=#a7d2cd:fontsize=17:x=832:y=156`,
    `drawtext=fontfile='${mono}':textfile='${filterPath(codePath)}':fontcolor=white:fontsize=18:x=832:y=198:line_spacing=9`,
    `drawtext=fontfile='${bold}':text='${index + 1} / ${scenes.length}':fontcolor=#a7d2cd:fontsize=20:x=38:y=674`,
    `drawtext=fontfile='${regular}':text='Listening House Open-Source Code Guide':fontcolor=white:fontsize=20:x=880:y=674`
  ].join(",");

  run(
    ffmpegPath,
    [
      "-y",
      "-f",
      "lavfi",
      "-i",
      "color=c=#eaf4f1:s=1280x720:r=2",
      "-i",
      audioPath,
      "-vf",
      draw,
      "-af",
      "apad=pad_dur=1.5",
      "-shortest",
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-tune",
      "stillimage",
      "-crf",
      "24",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      clipPath
    ],
    `Video scene ${index + 1}`
  );
  console.log(`Created scene ${index + 1}/${scenes.length}: ${scene.title}`);
  return clipPath;
}

function writeDocumentation() {
  const narration = [
    "# Listening House Code Walkthrough Narration",
    "",
    "This is the complete spoken script for `listening-house-code-walkthrough.mp4`.",
    "It is written for someone with a basic understanding of files, functions, and variables.",
    ""
  ];
  const storyboard = [
    "# Listening House Code Walkthrough Storyboard",
    "",
    "| Chapter | Section | Topic | Key files |",
    "| --- | --- | --- | --- |"
  ];

  scenes.forEach((scene, index) => {
    narration.push(`## ${index + 1}. ${scene.title}`, "", scene.narration, "");
    storyboard.push(
      `| ${index + 1} | ${scene.section} | ${scene.title} | ${scene.files.map((file) => `\`${file}\``).join(", ")} |`
    );
  });

  fs.writeFileSync(narrationScript, `${narration.join("\n")}\n`, "utf8");
  fs.writeFileSync(storyboardPath, `${storyboard.join("\n")}\n`, "utf8");
  fs.writeFileSync(
    path.join(outputDir, "README.md"),
    [
      "# Code Walkthrough Video",
      "",
      "This package explains the complete Listening House codebase in beginner-friendly language.",
      "",
      "- `listening-house-code-walkthrough.mp4`: generated narrated video",
      "- `NARRATION_SCRIPT.md`: complete accessible transcript",
      "- `STORYBOARD.md`: chapter and file index",
      "- `generated/`: temporary audio, text, and clip files",
      "",
      "Generate the video on Windows:",
      "",
      "```powershell",
      "npm run code:video -- --rebuild",
      "```",
      "",
      "The generator uses the installed Windows narration voice and the project's existing FFmpeg dependency.",
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
  const fonts = {
    regular: getFontPath(["C:\\Windows\\Fonts\\segoeui.ttf", "C:\\Windows\\Fonts\\arial.ttf"]),
    bold: getFontPath(["C:\\Windows\\Fonts\\segoeuib.ttf", "C:\\Windows\\Fonts\\arialbd.ttf"]),
    mono: getFontPath(["C:\\Windows\\Fonts\\consola.ttf", "C:\\Windows\\Fonts\\cour.ttf"])
  };
  if (!fonts.regular || !fonts.bold || !fonts.mono) {
    throw new Error("The required Windows fonts were not found.");
  }

  const clips = scenes.map((scene, index) => createClip(scene, index, fonts));
  const concatPath = path.join(generatedDir, "concat-list.txt");
  fs.writeFileSync(
    concatPath,
    clips.map((clip) => `file '${clip.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`).join("\n"),
    "utf8"
  );
  run(
    ffmpegPath,
    ["-y", "-f", "concat", "-safe", "0", "-i", concatPath, "-c", "copy", videoPath],
    "Combining code walkthrough"
  );
  writeDocumentation();
  console.log(`Created ${videoPath}`);
}

createVideo();
