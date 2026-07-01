# Performance and Capacity

## Short Answer

An 8 GB Raspberry Pi has far more memory than this app normally needs. Storage space, not RAM, is
the long-term limit.

The database does not need to be erased every day. The daily rollover clears the live dashboard but
keeps historical names, check-ins, activity requests, and status changes for analytics.

In the measured heavy-history test:

- 100,000 check-ins used 156.38 MiB.
- Each check-in averaged 1,639.79 bytes.
- Each test check-in included one first-and-last-name record, three activity requests, and two
  status changes per activity.
- A month containing 9,300 check-ins and 27,900 activity requests was assembled by the real
  analytics code in about 523 ms after the reporting optimization.

This is heavier than a name-only sign-in and is a reasonable planning model for real operation.

## What Was Tested

The storage test generated:

- 100,000 guest records
- 100,000 check-in records
- 300,000 scheduled activity records
- 600,000 status history records

Measured result:

```text
Database size:                    156.38 MiB
Average bytes per check-in:       1,639.79
Bulk write time:                  6.08 seconds
31-day SQL summary query:         141.48 ms
Application month report:         522.76 ms
People in application report:     9,300
```

The test machine was a Windows computer with an Intel Core Ultra 7 155H and 31.5 GB RAM. These CPU
timings are not presented as Raspberry Pi timings. A Raspberry Pi will be slower. The database-size
measurement and record-capacity calculation remain useful because SQLite stores the same records on
both systems.

Run the same test directly on the final Pi to measure its exact CPU and storage:

```bash
npm run stress:storage -- --check-ins 100000 --activities 3 --status-changes 2 --per-day 300
```

The test uses a temporary database and removes it afterward. It does not touch the real shelter
database.

## Simultaneous Live-Day Test

The live dashboard was also assembled with unusually large active-day counts:

| Active check-ins | Dashboard build | Response size | Node heap used |
| ---------------: | --------------: | ------------: | -------------: |
|            1,000 |        74.11 ms |      1.36 MiB |      11.87 MiB |
|            5,000 |       345.91 ms |      6.84 MiB |      29.98 MiB |

Run this test on the Pi with:

```bash
npm run stress:live -- --check-ins 1000
npm run stress:live -- --check-ins 5000
```

At 5,000 active people, Raspberry Pi memory is still not the main problem. Sending and rendering a
6.84 MiB dashboard on staff phones would become cumbersome. For normal daily operation, hundreds of
check-ins are comfortably within the tested range.

## Estimated Storage Life

The following estimates use the measured 1,639.79 bytes per check-in and deliberately reserve most
of the card for Raspberry Pi OS, updates, logs, builds, backups, and free-space headroom.

| Storage plan             | Space allocated to history | Estimated check-ins |
| ------------------------ | -------------------------: | ------------------: |
| 32 GB card, conservative |                     10 GiB |   about 6.5 million |
| 64 GB card, conservative |                     30 GiB |  about 19.6 million |

Estimated years before reaching those conservative history allocations:

| Check-ins per day |  10 GiB history |  30 GiB history |
| ----------------: | --------------: | --------------: |
|               100 | about 179 years | about 538 years |
|               300 |  about 60 years | about 179 years |
|               500 |  about 36 years | about 108 years |

These are mathematical storage estimates, not a recommendation to operate for decades without
maintenance. Card wear, backups, operating-system growth, log files, and hardware replacement will
matter first.

## Practical Retention Recommendation

The app has no storage-driven requirement to delete data every day, month, or year. A safer
operational policy is:

1. Keep daily history in SQLite.
2. Export and verify monthly reports.
3. Back up the database at least weekly.
4. Keep at least 20 percent of the Pi storage free.
5. Review or archive old history every one to five years according to the shelter's privacy and
   record-retention policy.
6. Replace or migrate the microSD card proactively rather than waiting for it to fail.

An SSD is preferable to a microSD card for a permanent installation because it generally has better
write endurance and easier capacity expansion.

## Why 8 GB RAM Does Not Increase History Capacity

SQLite writes history to `data/listening-house.sqlite`. RAM is used for the running Node server,
SQLite page cache, Chromium kiosk, and temporary report objects. Turning off the Pi does not erase
SQLite.

An 8 GB Pi helps when Chromium has several tabs, other programs run on the Pi, or very large reports
are generated. It does not make the SQLite file itself hold more records. The card or SSD size
controls that.

## Database Performance Protections

The schema indexes:

- Guest first and last names
- Check-ins by guest, status, and check-in time
- Activity items by check-in, guest, status, and scheduled start
- Status history by change time

Day, week, month, and year reports filter the requested date range in SQLite before JavaScript
formats the report. Date formatters are reused instead of recreated for every row. These two changes
are what reduced the measured 9,300-person month report from about seven seconds to about half a
second on the test computer.

## Backups

For a consistent manual backup, stop the service, copy the database, and restart:

```bash
sudo systemctl stop listening-house
cp data/listening-house.sqlite /path/to/backup/listening-house-$(date +%F).sqlite
sudo systemctl start listening-house
```

If the server must remain online, use SQLite's backup command rather than copying only the main file
while WAL mode is active.
