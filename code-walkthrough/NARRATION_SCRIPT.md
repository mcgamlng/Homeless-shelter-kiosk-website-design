# Listening House Code Walkthrough Narration

This is the complete spoken script for `listening-house-code-walkthrough.mp4`.
It is written for someone with a basic understanding of files, functions, and variables.

## 1. What this project is

Welcome to the Listening House guest check-in system code walkthrough. This video assumes you understand basic ideas such as files, functions, and variables, but it does not assume professional programming experience. The easiest way to understand the project is as one system with three main layers. React creates everything people see and touch in the browser. Express is the Node.js server that receives requests and applies the rules. SQLite is the local database file that remembers guests, activities, schedules, and settings. Socket.IO connects the server back to every open staff dashboard so changes appear immediately. The Android app does not duplicate the website. It opens the same staff dashboard and adds Android alarm and notification support.

## 2. The complete request journey

Here is the most important flow in the entire codebase. A guest presses a button in Kiosk dot J S X. That React component calls a function in src slash api dot J S. The API helper turns the information into JSON and sends it to a route such as post slash api slash check-ins. Server slash index dot J S receives the request and calls the repository. The repository checks the name, duplicate-day rules, activity availability, daily limits, and scheduling. It writes the check-in and activity requests inside a database transaction. A transaction means every related write succeeds together or none of them are saved. Finally, the server emits dashboard update through Socket.IO, and every connected staff screen receives the new state.

## 3. How the folders are organized

The folder structure is intentionally direct. The src folder is the browser application. Pages, icons, translations, API calls, Socket.IO setup, and CSS live there. The server folder contains the Express server, database access, scheduler, translation and speech services, spreadsheet generator, and network detection. Shared contains small modules that must behave the same on both sides, such as kiosk customization validation and built-in activity translations. Mobile slash Android contains the native Java wrapper. Scripts contains startup installers, Raspberry Pi helpers, stress tests, demo data, and video generators. Tests contains Node's automated test files. Documentation at the project root explains deployment, capacity, public access, and architecture.

## 4. package.json and the technology choices

Package dot JSON is the project control panel. The dependencies section lists the libraries the system needs. Express handles web requests. Better SQLite three talks to the database. React draws the interface. Socket.IO provides live updates. QR code creates installation codes. Lucide React provides consistent icons. Vite compiles the React source into the dist folder. The scripts section gives reliable commands. N P M run build creates production browser files. N P M start runs the real server. N P M test runs every automated test. Keeping these dependencies limited avoids a heavy framework, cloud database, or local artificial intelligence model, which helps the software run comfortably on a Raspberry Pi with four gigabytes of memory.

## 5. React startup, routes, and the shared shell

The browser starts in index dot HTML, which contains a single root element. Main dot J S X asks React to render the App component into that root. App dot J S X is the traffic director. React Router looks at the address, such as slash kiosk or slash dashboard, and renders the matching page. App also provides the shared header, navigation, saved customization settings, and staff protection. The kiosk keeps staff navigation hidden behind a small menu. Dashboard and Admin use the staff PIN gate. After a successful PIN request, the browser stores a temporary session token in session storage. That token is sent with protected API calls. Refreshing the page keeps the token, but restarting the server invalidates it because sessions live only in server memory.

## 6. The API helper and Socket.IO client

Src slash api dot J S prevents every page from rewriting fetch logic. Each exported function knows its URL, method, request body, and whether it needs an admin token. The shared request helper converts JavaScript objects into JSON, checks the response status, reads error messages, and throws normal Error objects that React can display. Src slash socket dot J S creates the Socket.IO connection for the staff dashboard. It sends the same temporary staff token during the connection handshake. When the server sends dashboard update, the client replaces the dashboard data with the newest snapshot. Keeping normal requests and live connections in these two files makes the pages easier to read and makes server-address changes much safer.

## 7. The guest kiosk state machine

Kiosk dot J S X behaves like a small state machine. A state machine means the interface can be in one clearly named step at a time. The steps are welcome, identity, language, activities, and confirmation. React state stores the current step, selected language, entered first and last name, selected activity identifiers, errors, and loading state. Moving backward changes the step without creating database records. The permanent check-in is created only when the guest submits activities. This prevents half-finished visits. The confirmation page intentionally hides staff schedule times and tells the guest to wait for their name. A ten-second timer returns the kiosk to the welcome screen if the guest does not press Finish, preparing it for the next person.

## 8. Names, privacy, and duplicate prevention

The identity flow is deliberately minimal. The guest enters first and last name. The repository normalizes the values and searches for an existing guest using a case-insensitive comparison. If the name is new, the system creates a guest profile and labels the visit as a sign-up. If the name already exists, it reuses that guest identifier and labels the visit as a sign-in. Before the activity screen, inspectNameCheckIn checks whether the same guest already has a check-in in the current operating day. If so, the kiosk asks them to speak with staff. The database does not request email, phone number, birthdate, address, government identification, medical details, or private notes.

## 9. Translations and custom activity names

The kiosk supports English, Spanish, Hmong, and Somali. Src slash i eighteen n dot J S stores interface phrases and helper functions for times and durations. Activity names are different because administrators can create them. Shared slash activity translations contains a local dictionary for common shelter vocabulary. When an administrator adds an unfamiliar English label, translation service first checks local terms and then requests an online translation for Spanish, Hmong, and Somali. Only the activity label is sent. Guest names and visit data are never sent to translation. The translated names are stored on the activity and copied into each scheduled item, so historical reports keep the wording that was used at check-in even if the activity is renamed later.

## 10. Read-aloud architecture

Read aloud uses a language-specific strategy because one voice system does not support every language well. English and Somali use the best matching voice installed on the device. Spanish requests smoother Spanish audio from the server and falls back to a local Spanish voice if the internet is unavailable. Hmong uses a separately installed native-recorded voice pack. Speech service converts numbers, finds the matching syllable recordings, trims isolated recording boundaries, blends them with an equal-power crossfade, and returns one continuous wave file for a complete sentence. The browser plays that sentence as one audio item. Activity cards still have a deliberate pause between cards so a listener can tell where one option ends and the next begins.

## 11. Dashboard data and the new live clock

Dashboard dot J S X first requests the complete protected dashboard snapshot. It then opens a Socket.IO connection and replaces that snapshot whenever the server broadcasts an update. The component already maintains clockNow, a timestamp refreshed every second. That single timer drives activity countdowns, starting-soon checks, and the live clock at the top of Who Needs Attention Next. Reusing it avoids another background timer. The clock uses the device's local time zone, displays hours, minutes, seconds, and the current date, and uses tabular numbers so changing digits do not shift the layout. The dashboard also receives a daily number calculated from check-in order, allowing staff to understand that Person One arrived before Person Two without exposing a permanent identity number.

## 12. The Staff Action Center

The Staff Action Center is a focused view of the calendar. StaffAlerts dot J S contains pure functions that decide which items need attention and describe the timing in plain language, such as in progress now, starts soon, or overdue. Keeping those calculations outside React makes them easy to test. Each action card shows the daily person number, guest name, activity, status, scheduled start, scheduled end, and four status controls. Pressing Start changes the item to In Progress and begins its operational countdown from the current time. Pressing Complete or Skip records the actual end time and asks the scheduler to move waiting work forward when possible. Socket.IO then sends the result to every other staff screen.

## 13. How the time calendar is drawn

The desktop and tablet calendar is a visual time map. Every active timed activity becomes a vertical lane. Utility functions calculate the number of minutes between the workday start and an appointment. Dashboard multiplies those minutes by three point one pixels to calculate the block's top position. It uses the same scale for height, so a sixty-minute appointment is exactly twice as tall as a thirty-minute appointment. Very short activities use compact CSS classes that hide text which cannot fit, while preserving the person number and click target. Opening a block reveals movement and status controls. The phone layout uses simpler cards because a full horizontal day calendar would be difficult to operate on a narrow screen.

## 14. Automatic earliest-gap scheduling

Server slash scheduler dot J S contains the most specialized business logic. ScheduleActivities receives the selected activities, guest identifier, existing appointments, buffer setting, current time, and workday settings. It separates timed from untimed services. For each remaining timed activity, it calls findEarliestSlot. That function checks the activity lane and the same guest's appointments. ScheduleActivities compares the candidate openings and chooses the earliest legal one rather than blindly preserving selection order. This allows a guest to use an open private room while the legal-support lane is occupied. After reserving that slot, it repeats for the guest's remaining services. The result obeys activity-specific hours, the overall workday, the guest's check-in time, duration, and the configured buffer.

## 15. Manual moves and schedule repair

Automatic scheduling is only the starting point. Staff can move a block five minutes earlier or later, enter an exact time, drag it, or reorder one guest's services. The server never trusts the browser to enforce the rules. RepairScheduleAfterMove rounds the requested time to five minutes, verifies it is not in the past or before check-in, verifies the activity is open, and makes the selected block the pinned appointment. It then rebuilds affected waiting appointments around that choice while protecting lane conflicts and same-guest buffers. ReorderCheckInItems calls scheduleActivities with preserveOrder enabled, which means an explicit staff sequence is treated differently from the automatic earliest-gap order.

## 16. Completion, skipping, and compaction

When staff completes or skips a timed activity, the saved end time becomes the moment the button was pressed. CompactScheduleAfterFinalStatus changes that item to a final status and calls rebalanceWaitingSchedule. Completed and skipped work remains historical. In Progress work remains fixed because a guest is already using that service. Waiting work is compared again and placed into the earliest available legal gaps after the current moment. The rebalancer will not move an item past the workday end or its own activity closing time. If the remaining day cannot hold every appointment, the repository does not partially rewrite the schedule. This all-or-nothing behavior avoids a confusing half-compacted calendar.

## 17. Activity configuration

Admin dot J S X contains the largest form because each shelter service can behave differently. Calendar time controls whether the service receives a scheduled block and duration. Daily quantity limits control how many requests can be accepted. Staff timer alerts control ending warnings. Available hours restrict the service inside the workday. Monthly and yearly windows handle repeating availability. These switches are independent, so an activity can use any combination. The icon picker stores a simple icon name, not an image upload. English and translated names are editable. When an activity is deleted, the repository first removes the live foreign-key reference from existing scheduled items, then deletes the definition. The copied historical activity name remains in old visit records.

## 18. Kiosk customization and network settings

Kiosk customization is stored in the settings table. Administrators can change the shelter name, system label, welcome text, helper text, confirmation wording, button text, and color values. Shared slash kiosk customization defines defaults, allowed keys, and color validation used by both server and browser. This prevents arbitrary CSS from being inserted. The Admin preview is a carousel that renders the five guest steps using the unsaved form values, so staff can review changes before saving. Network and Phone Access is separate. Server slash network detects local addresses, validates the chosen base URL, and decides whether QR codes should use local Wi-Fi or a configured public H T T P S address.

## 19. Analytics and spreadsheet exports

Analytics begins with the exact requested local date and period. GetReportBounds calculates local start and end moments for a day, week, month, or year. Those boundaries are converted to U T C timestamp strings before querying SQLite, because SQLite's current timestamp is stored in U T C. Results are converted back to local dates for display. The repository groups check-ins, unique guests, new and returning visits, requested activities, statuses, and daily totals. It also builds a People section with each person's visit dates and requested services. Server slash xlsx dot J S creates the workbook package directly using lightweight code. Microsoft Excel does not need to be installed on the Raspberry Pi.

## 20. Express routes and error handling

Server slash index dot J S creates the Express application and the HTTP server. Routes are intentionally thin. They read request values, require an admin session when necessary, call a repository or service function, emit a dashboard update after a change, and return JSON or a file. HandleRoute catches errors from synchronous and asynchronous handlers and returns the error's status code and readable message without exposing an internal stack trace. Express JSON is limited to two hundred fifty-six kilobytes because the application has no reason to accept large uploads. After all API routes, the server serves the dist folder created by Vite. Unknown browser routes return index dot HTML so React Router can open pages directly.

## 21. The repository as the business boundary

Repository dot J S is the main business boundary and therefore one of the most important files to understand. It is the only place that should know both application rules and detailed SQL queries. CreateCheckIn prepares the guest, validates activities, schedules timed work, inserts every row, rebalances waiting work, and returns the completed visit. GetDashboardData joins guests, visits, and scheduled items and adds daily person numbers. UpdateScheduledItemStatus applies status-specific scheduling behavior and writes status history. GetAnalyticsReport creates grouped historical data. ResetDailyData clears the live day without deleting history. Keeping this logic out of React prevents a phone or modified browser from bypassing important rules.

## 22. Opening SQLite, migrations, and WAL mode

Server slash db dot J S opens the file configured by DATABASE_PATH. If the folder does not exist, startup creates it. Schema dot S Q L describes the tables for a new installation. Existing Raspberry Pis may have an older database, so db dot J S also inspects columns, adds missing fields, and rebuilds tables when a structural migration is necessary. Foreign keys protect relationships between records. Write-ahead logging, usually called WAL mode, lets staff dashboards read while the kiosk writes, with less blocking than SQLite's older journal mode. Indexes on guest names, statuses, check-in identifiers, and schedule times make common queries fast. The database file and its WAL companion files are ignored by Git because real shelter data must never be published.

## 23. What each database table means

The guests table stores one reusable identity with first name, last name, and timestamps. Check ins stores visits and points back to a guest. It records sign-up versus returning sign-in, language, status, and visit times. Scheduled activity items stores one requested service for one check-in. It copies activity names, translations, duration, availability rules, alarm settings, schedule times, and status so history remains understandable after Admin changes. Activities stores the current service definitions. Status history records transitions for auditing. Settings stores workday rules, kiosk customization, network choices, daily rollover markers, and the hashed administrator PIN. The design avoids a large personal profile and keeps operational history separate from current configuration.

## 24. Daily rollover and historical preservation

The operating day is not implemented by deleting records. EnsureCurrentDashboardDay compares a saved marker with the current local calendar day. After midnight, old active check-ins are changed to cleared and a new marker is stored. The guest list, check-ins, scheduled items, and status history remain available to reporting. A manual New Day Reset creates an immediate boundary even on the same calendar date by recording the highest previous check-in identifier. Live dashboard queries use the date marker or identifier floor to exclude earlier work. Analytics deliberately ignores that live boundary and queries historical timestamps. Automated tests verify that a reset returns active totals to zero and that the next guest becomes Person One.

## 25. Admin sessions, PIN storage, and privacy

The administrator PIN is never stored as readable text after it is changed. Repository uses P B K D F two with a random salt and one hundred thousand iterations, then stores the resulting hash in settings. When staff enters the correct PIN, server index creates a random session token and stores it in an in-memory map. Protected HTTP routes require that token in the Authorization header. Socket.IO checks it during the connection handshake. Restarting the server clears all sessions, which requires staff to unlock again. This is appropriate for a local prototype, but it is not a full public identity system with user accounts, role management, password recovery, audit administrators, or multi-factor authentication.

## 26. Socket.IO and synchronized staff screens

Real-time synchronization uses a simple snapshot model. After a check-in, status change, schedule move, activity update, or reset, emitDashboard calls getDashboardData and broadcasts the complete current dashboard. Every authorized browser receives dashboard update and replaces its React state. A snapshot is slightly larger than sending tiny patches, but the daily data set is small and the logic is much easier to reason about. Phones cannot miss a dependent patch and end up with inconsistent state. Socket.IO also handles reconnect attempts when Wi-Fi briefly disconnects. Authentication happens before the connection is accepted, so the kiosk does not receive staff dashboard data.

## 27. Browser alarms and the Stop Alarm path

Browser alarms are opt-in because browsers require a user gesture before sound and notifications. When staff enables alerts, Dashboard checks waiting activities for starting-soon reminders and In Progress activities for their configured ending threshold. An active ending alert is stored in React state. A separate effect repeats sound and vibration while at least one alert exists. The visible Stop Alarm button removes the alert, stops vibration, closes the notification, records the occurrence as dismissed, and tells the Android bridge to cancel its native alarm. The dismissed set prevents the one-second checker from immediately recreating the same warning. Wake Lock is requested when supported so an actively used staff screen does not sleep.

## 28. The Android wrapper and native alarms

The Android application is intentionally small. MainActivity creates a WebView, which is Android's embedded browser, and loads the configured dashboard URL. It remembers that address so the app can reconnect after restarts or network changes. The custom L H check-in URL lets the Admin page configure the installed app with one tap. A JavaScript interface named L H CheckIn exposes carefully limited native methods to the website. Dashboard sends upcoming start and ending alarms through that bridge. ActivityAlarmScheduler uses Android AlarmManager, and ActivityAlarmReceiver creates a system notification when the alarm fires. The notification includes a Stop Alarm action. The manifest declares internet, notification, vibration, wake, and exact-alarm permissions.

## 29. Local Wi-Fi and public access

In local mode, Node listens on zero point zero point zero point zero, which means other devices can reach the server through the computer or Raspberry Pi's network address. Phones must use the same Wi-Fi and that Wi-Fi must allow devices to communicate with each other. The Windows firewall helper opens the application port. Raspberry Pi dot local may work through multicast D N S, while the numeric local address is the fallback. In public mode, PUBLIC_URL or Admin's public address becomes the base URL. The documented Cloudflare Tunnel option provides H T T P S without opening a router port. Access Info and the About page build browser, iPhone, Android download, and Android configuration links from the chosen base.

## 30. Manual startup and automatic boot

The manual startup path is simple. Install dependencies once, run N P M run build after code changes, and run N P M start to launch the production server. On Windows, the startup installer creates a Task Scheduler entry. Its PowerShell launcher starts Node in the project folder, waits for the health endpoint, and opens Chrome or Edge in kiosk mode. On Raspberry Pi, the installer creates a systemd service. Systemd starts the Node server at boot and can restart it after a failure. A desktop autostart file launches Chromium with the kiosk URL and full-screen flags. The server must be running for the kiosk, dashboard, QR links, and Android app to work.

## 31. Automated tests and stress tests

The project uses Node's built-in test runner. Repository tests create temporary SQLite databases and verify names, limits, translations, resets, analytics, and spreadsheet contents. Scheduler tests use fixed dates so results do not depend on the current clock. Pure frontend helper tests verify translations, voices, alerts, networking, and icons. Stress test storage creates a large historical data set and measures file size and report time. Stress test live day measures heavy same-day scheduling. A production build catches module and JSX errors. Formatting prevents accidental style drift. Finally, rendered browser checks are still necessary for responsive layout, clipping, visible controls, and interactions such as the live clock changing every second.

## 32. Why SQLite fits the Raspberry Pi

An eight-gigabyte Raspberry Pi has far more memory than this application normally needs. The important storage limit is the disk, not RAM. Each guest, visit, and activity request is a small database row. The application does not store photos, video, scanned identification, or artificial intelligence models. SQLite reads only the rows required for a dashboard or report, and indexes reduce scanning. Historical data does not need routine deletion. Performance and Capacity documents measured storage and report behavior. A shelter should still create regular backups. The safest simple backup is to stop the service, copy data slash listening-house dot sqlite to protected storage, and restart the service.

## 33. Build, deploy, and update safely

A safe update changes source files, not generated dist files. First back up the database. Pull the new Git commit. Run N P M install if package files changed. Run tests and the formatting check. Run N P M run build to regenerate the browser bundle. Restart the Node service. On startup, db dot J S applies compatible migrations to the existing SQLite file. Open the health endpoint, kiosk, dashboard, and Admin page, then test one non-sensitive check-in. The Android app usually does not need rebuilding for website-only changes because it loads the live website. Rebuild the A P K when native Java, permissions, icons, or app connection behavior changes.

## 34. GitHub, the MIT license, and excluded data

The GitHub repository is the shareable source, not the live shelter data. The MIT license allows people to use, modify, and redistribute the project while keeping the copyright and license notice. Gitignore excludes node modules, production builds, environment secrets, SQLite data, Android build folders, A P K binaries, and generated videos. Dot env example shows the names of settings without publishing real values. The Hmong voice pack is downloaded separately and follows Yuhalu's non-commercial terms, documented in Third Party Notices. Before every push, inspect Git status and the staged diff. Never publish a real database, guest list, administrator secret, tunnel token, Wi-Fi password, or private operational report.

## 35. How to trace and change a feature

When changing a feature, trace one complete path instead of searching randomly. Start with the visible text or control in a page component. Find its click or change handler. Follow the API function it calls. Find the matching Express route. Follow that route into repository, scheduler, network, speech, or translation logic. Identify the database tables or settings involved. Then follow the returned data back to React. Add or update a focused automated test for the rule. Build the project and verify the rendered interface at desktop and phone sizes. Update README or System Guide when the operational behavior changes. This path keeps frontend appearance, server enforcement, stored data, and documentation aligned.

## 36. A practical debugging map

For a blank page, confirm the server health endpoint, rebuild dist, and inspect browser console errors. For a readable red or warning message, locate the matching API route and repository validation. If old guests appear, confirm the server is using the expected DATABASE_PATH and that the operating-day marker rolled over. If changes disappear after restart, confirm the correct database file and that the update was saved through the API. For phone failures, open Access Info, verify the server address, make sure the phone and server share a non-isolated Wi-Fi network, and check the firewall. For public access, verify the H T T P S tunnel and PUBLIC_URL. Speech Status confirms whether the Hmong voice pack is installed.

## 37. The mental model to remember

The entire system can be remembered in one sentence. React asks, Express receives, the repository decides, the scheduler places, SQLite remembers, and Socket.IO announces. The kiosk and staff tools are two views of the same server. Admin settings make activities, wording, colors, network addresses, and operational limits data-driven, so another shelter can adapt the system without rewriting its architecture. Privacy comes from collecting little information and keeping the database local. Reliability comes from transactions, daily rollover, tests, automatic startup, and backups. When you need more detail, start with System Guide for architecture, README for operation, deployment documents for installation, and the test files for concrete examples of the rules.
