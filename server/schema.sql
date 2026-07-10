PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS activities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  name_es TEXT,
  name_hmn TEXT,
  name_so TEXT,
  duration_minutes INTEGER NOT NULL DEFAULT 20 CHECK (duration_minutes > 0),
  time_limit_enabled INTEGER NOT NULL DEFAULT 1,
  availability_window_enabled INTEGER NOT NULL DEFAULT 0,
  availability_start TEXT NOT NULL DEFAULT '08:00',
  availability_end TEXT NOT NULL DEFAULT '16:00',
  weekly_window_enabled INTEGER NOT NULL DEFAULT 0,
  weekly_days TEXT NOT NULL DEFAULT '0,1,2,3,4,5,6',
  monthly_window_enabled INTEGER NOT NULL DEFAULT 0,
  monthly_start_day INTEGER NOT NULL DEFAULT 1,
  monthly_end_day INTEGER NOT NULL DEFAULT 31,
  yearly_window_enabled INTEGER NOT NULL DEFAULT 0,
  yearly_start TEXT NOT NULL DEFAULT '01-01',
  yearly_end TEXT NOT NULL DEFAULT '12-31',
  daily_limit_enabled INTEGER NOT NULL DEFAULT 0,
  daily_limit INTEGER CHECK (daily_limit IS NULL OR daily_limit > 0),
  waitlist_enabled INTEGER NOT NULL DEFAULT 0,
  confirmed_spots INTEGER CHECK (confirmed_spots IS NULL OR confirmed_spots >= 0),
  waitlist_spots INTEGER CHECK (waitlist_spots IS NULL OR waitlist_spots >= 0),
  alarm_enabled INTEGER NOT NULL DEFAULT 0,
  alarm_minutes_before INTEGER NOT NULL DEFAULT 5 CHECK (alarm_minutes_before > 0),
  icon TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS guests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS check_ins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guest_id INTEGER NOT NULL,
  sign_in_type TEXT NOT NULL DEFAULT 'sign_in',
  language TEXT NOT NULL DEFAULT 'en',
  status TEXT NOT NULL DEFAULT 'active',
  checked_in_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  cleared_at TEXT,
  FOREIGN KEY (guest_id) REFERENCES guests(id)
);

CREATE TABLE IF NOT EXISTS scheduled_activity_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  check_in_id INTEGER NOT NULL,
  activity_id INTEGER,
  guest_id INTEGER NOT NULL,
  activity_name TEXT NOT NULL,
  activity_name_es TEXT,
  activity_name_hmn TEXT,
  activity_name_so TEXT,
  duration_minutes INTEGER NOT NULL DEFAULT 20 CHECK (duration_minutes > 0),
  is_timed INTEGER NOT NULL DEFAULT 1,
  activity_window_enabled INTEGER NOT NULL DEFAULT 0,
  activity_start_time TEXT NOT NULL DEFAULT '08:00',
  activity_end_time TEXT NOT NULL DEFAULT '16:00',
  scheduled_start TEXT,
  scheduled_end TEXT,
  alarm_enabled INTEGER NOT NULL DEFAULT 0,
  alarm_minutes_before INTEGER NOT NULL DEFAULT 5,
  service_spot_status TEXT NOT NULL DEFAULT 'confirmed',
  service_spot_number INTEGER,
  status TEXT NOT NULL DEFAULT 'Waiting',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (check_in_id) REFERENCES check_ins(id) ON DELETE CASCADE,
  FOREIGN KEY (activity_id) REFERENCES activities(id),
  FOREIGN KEY (guest_id) REFERENCES guests(id)
);

CREATE TABLE IF NOT EXISTS status_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scheduled_item_id INTEGER NOT NULL,
  old_status TEXT,
  new_status TEXT NOT NULL,
  changed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (scheduled_item_id) REFERENCES scheduled_activity_items(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS daily_export_archives (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_date TEXT NOT NULL UNIQUE,
  filename TEXT NOT NULL,
  file_path TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS staff_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  display_name TEXT NOT NULL,
  pin_hash TEXT NOT NULL,
  can_dashboard INTEGER NOT NULL DEFAULT 0,
  can_admin INTEGER NOT NULL DEFAULT 0,
  can_about INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_check_ins_status ON check_ins(status);
CREATE INDEX IF NOT EXISTS idx_check_ins_guest ON check_ins(guest_id);
CREATE INDEX IF NOT EXISTS idx_check_ins_checked_in_at ON check_ins(checked_in_at);
CREATE INDEX IF NOT EXISTS idx_guests_name ON guests(last_name, first_name);
CREATE INDEX IF NOT EXISTS idx_scheduled_check_in ON scheduled_activity_items(check_in_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_guest ON scheduled_activity_items(guest_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_status ON scheduled_activity_items(status);
CREATE INDEX IF NOT EXISTS idx_scheduled_start ON scheduled_activity_items(scheduled_start);
CREATE INDEX IF NOT EXISTS idx_status_history_changed_at ON status_history(changed_at);
CREATE INDEX IF NOT EXISTS idx_daily_exports_report_date ON daily_export_archives(report_date);
CREATE INDEX IF NOT EXISTS idx_staff_users_display_name ON staff_users(display_name);
