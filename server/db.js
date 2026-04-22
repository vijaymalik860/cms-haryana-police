import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Open database in the root folder
const db = new Database(join(__dirname, '../data.db'), { verbose: console.log });

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS profiles (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL,
    full_name TEXT NOT NULL,
    badge_number TEXT,
    rank TEXT,
    station_id TEXT,
    status TEXT DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS firs (
    id TEXT PRIMARY KEY,
    fir_number TEXT UNIQUE NOT NULL,

    -- Section 1: Basic Details
    district TEXT NOT NULL,
    police_station TEXT NOT NULL,
    year INTEGER NOT NULL,
    date_time_of_fir TEXT NOT NULL,

    -- Section 2: Acts & Sections (JSON array)
    acts_sections TEXT NOT NULL DEFAULT '[]',

    -- Section 3: Occurrence of Offence
    occurrence_day TEXT,
    occurrence_date_from TEXT,
    occurrence_date_to TEXT,
    occurrence_time_period TEXT,
    occurrence_time_from TEXT,
    occurrence_time_to TEXT,
    info_received_date TEXT,
    info_received_time TEXT,
    gd_entry_no TEXT,
    gd_date_time TEXT,

    -- Section 4: Type of Information
    info_type TEXT DEFAULT 'Written',

    -- Section 5: Place of Occurrence
    place_direction TEXT,
    place_distance TEXT,
    beat_no TEXT,
    place_address TEXT,
    latitude REAL,
    longitude REAL,
    outside_ps_name TEXT,
    outside_district TEXT,

    -- Section 6: Complainant Details
    complainant_name TEXT NOT NULL,
    complainant_father_name TEXT,
    complainant_dob TEXT,
    complainant_nationality TEXT DEFAULT 'INDIA',
    complainant_uid TEXT,
    complainant_passport TEXT,
    complainant_id_details TEXT DEFAULT '[]',
    complainant_occupation TEXT,
    complainant_present_address TEXT,
    complainant_permanent_address TEXT,
    complainant_phone TEXT,

    -- Section 7: Accused Details (JSON array)
    accused_details TEXT NOT NULL DEFAULT '[]',

    -- Section 8: Delay Reason
    delay_reason TEXT,

    -- Section 9 & 10: Property Details (JSON array) & Total Value
    property_details TEXT NOT NULL DEFAULT '[]',
    total_property_value REAL DEFAULT 0,

    -- Section 12: FIR Narrative Content
    fir_content TEXT NOT NULL,

    -- Section 13: Action Taken
    io_name TEXT,
    io_rank TEXT,
    io_no TEXT,
    refused_reason TEXT,
    transferred_ps TEXT,
    transferred_district TEXT,

    -- Section 14: Officer in Charge
    officer_name TEXT,
    officer_rank TEXT,
    officer_no TEXT,

    -- Section 15: Dispatch
    dispatch_date_time TEXT,

    -- Meta
    status TEXT DEFAULT 'registered',
    registered_by TEXT NOT NULL,
    complaint_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS cdr_requests (
    id TEXT PRIMARY KEY,
    fir_id TEXT NOT NULL,
    phone_number TEXT NOT NULL,
    status TEXT DEFAULT 'requested',
    tsp_name TEXT,
    requested_by TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(fir_id) REFERENCES firs(id)
  );

  CREATE TABLE IF NOT EXISTS arrests (
    id TEXT PRIMARY KEY,
    fir_id TEXT NOT NULL,
    accused_name TEXT NOT NULL,
    date_of_arrest TEXT NOT NULL,
    arrest_memo TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(fir_id) REFERENCES firs(id)
  );

  CREATE TABLE IF NOT EXISTS notices (
    id TEXT PRIMARY KEY,
    fir_id TEXT NOT NULL,
    notice_type TEXT NOT NULL,
    content TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(fir_id) REFERENCES firs(id)
  );

  CREATE TABLE IF NOT EXISTS evidences (
    id TEXT PRIMARY KEY,
    fir_id TEXT NOT NULL,
    description TEXT NOT NULL,
    location TEXT,
    extra_details TEXT,
    seizure_memo TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(fir_id) REFERENCES firs(id)
  );

  CREATE TABLE IF NOT EXISTS challans (
    id TEXT PRIMARY KEY,
    fir_id TEXT NOT NULL,
    io_notes TEXT,
    final_report TEXT,
    generated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(fir_id) REFERENCES firs(id)
  );

  CREATE TABLE IF NOT EXISTS case_diaries (
    id TEXT PRIMARY KEY,
    fir_id TEXT NOT NULL,
    entry_text TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(fir_id) REFERENCES firs(id)
  );
`);

// Auto-migrate tables for new columns (e.g. after schema updates)
try {
  // Check if latitude exists
  const tableInfo = db.pragma('table_info(firs)');
  const hasLatitude = tableInfo.some(col => col.name === 'latitude');
  
  if (!hasLatitude) {
    db.exec(`
      ALTER TABLE firs ADD COLUMN latitude REAL;
      ALTER TABLE firs ADD COLUMN longitude REAL;
    `);
    console.log('Added latitude and longitude columns to firs table.');
  }

  const hasComplaintId = tableInfo.some(col => col.name === 'complaint_id');
  if(!hasComplaintId) {
    db.exec(`ALTER TABLE firs ADD COLUMN complaint_id TEXT;`);
    console.log('Added complaint_id column to firs table.');
  }

  const evidenceTableInfo = db.pragma('table_info(evidences)');
  const hasMediaFile = evidenceTableInfo.some(col => col.name === 'media_file');
  if(!hasMediaFile) {
    db.exec(`ALTER TABLE evidences ADD COLUMN media_file TEXT;`);
    console.log('Added media_file column to evidences table.');
  }

  // Arrest memo new fields (matching official Haryana Police template)
  const arrestTableInfo = db.pragma('table_info(arrests)');
  const existingArrestCols = arrestTableInfo.map(col => col.name);
  const newArrestCols = [
    ['arresting_officer_name', 'TEXT'],
    ['arresting_officer_rank', 'TEXT'],
    ['arresting_officer_badge', 'TEXT'],
    ['arresting_officer_post', 'TEXT'],
    ['accused_address', 'TEXT'],
    ['arrest_place', 'TEXT'],
    ['informed_person_name', 'TEXT'],
    ['informed_person_address', 'TEXT'],
    ['informed_person_phone', 'TEXT'],
    ['witness_name', 'TEXT'],
    ['witness_post', 'TEXT'],
  ];
  for (const [col, type] of newArrestCols) {
    if (!existingArrestCols.includes(col)) {
      db.exec(`ALTER TABLE arrests ADD COLUMN ${col} ${type};`);
      console.log(`Added ${col} column to arrests table.`);
    }
  }
} catch (err) {
  console.log('Migration note:', err.message);
}

// Insert seed data if profiles is empty
const count = db.prepare('SELECT COUNT(*) as c FROM profiles').get().c;
if (count === 0) {
  const insert = db.prepare(`
    INSERT INTO profiles (id, username, password, role, full_name, badge_number, rank, station_id)
    VALUES (@id, @username, @password, @role, @full_name, @badge_number, @rank, @station_id)
  `);

  const users = [
    {
      id: 'usr-1', username: 'admin', password: 'admin123', role: 'admin',
      full_name: 'Test Admin', badge_number: 'ADM-001', rank: 'SP', station_id: 'hq'
    },
    {
      id: 'usr-2', username: 'io_1', password: 'io123', role: 'io',
      full_name: 'Investigating Officer Singh', badge_number: 'IO-101', rank: 'SI', station_id: 'stn-1'
    },
    {
      id: 'usr-3', username: 'sho_1', password: 'sho123', role: 'sho',
      full_name: 'SHO Kumar', badge_number: 'SHO-201', rank: 'Inspector', station_id: 'stn-1'
    }
  ];

  const transaction = db.transaction((users) => {
    for (const user of users) insert.run(user);
  });
  
  transaction(users);
  console.log('Seed users created.');
}

export default db;
