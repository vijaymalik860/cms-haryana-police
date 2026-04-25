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
    io_id TEXT,
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
    status TEXT DEFAULT 'under_investigation',
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

  CREATE TABLE IF NOT EXISTS complaints (
    id TEXT PRIMARY KEY,
    complaint_number TEXT UNIQUE NOT NULL,
    complainant_name TEXT NOT NULL,
    complainant_father_name TEXT,
    complainant_dob TEXT,
    complainant_nationality TEXT DEFAULT 'INDIA',
    complainant_phone TEXT,
    complainant_occupation TEXT,
    complainant_present_address TEXT,
    complainant_permanent_address TEXT,
    complainant_uid TEXT,
    district TEXT,
    police_station TEXT,
    complaint_text TEXT,
    incident_place TEXT,
    incident_date TEXT,
    status TEXT DEFAULT 'pending',
    registered_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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

  const hasIoId = tableInfo.some(col => col.name === 'io_id');
  if(!hasIoId) {
    db.exec(`ALTER TABLE firs ADD COLUMN io_id TEXT;`);
    console.log('Added io_id column to firs table.');
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

// Insert seed complaints if complaints table is empty
const complaintCount = db.prepare('SELECT COUNT(*) as c FROM complaints').get().c;
if (complaintCount === 0) {
  const insertComplaint = db.prepare(`
    INSERT INTO complaints (
      id, complaint_number, complainant_name, complainant_father_name, complainant_dob,
      complainant_nationality, complainant_phone, complainant_occupation,
      complainant_present_address, complainant_permanent_address, complainant_uid,
      district, police_station, complaint_text, incident_place, incident_date, status
    ) VALUES (
      @id, @complaint_number, @complainant_name, @complainant_father_name, @complainant_dob,
      @complainant_nationality, @complainant_phone, @complainant_occupation,
      @complainant_present_address, @complainant_permanent_address, @complainant_uid,
      @district, @police_station, @complaint_text, @incident_place, @incident_date, @status
    )
  `);

  const seedComplaints = [
    {
      id: 'cmp-001', complaint_number: 'CMP/2026/0001',
      complainant_name: 'Ramesh Kumar Sharma', complainant_father_name: 'Suresh Kumar Sharma',
      complainant_dob: '15/04/1985', complainant_nationality: 'INDIA',
      complainant_phone: '9876543210', complainant_occupation: 'Farmer',
      complainant_present_address: 'H.No. 45, Village Samalkha, Panipat, Haryana',
      complainant_permanent_address: 'H.No. 45, Village Samalkha, Panipat, Haryana',
      complainant_uid: '123456789012',
      district: 'PANIPAT', police_station: 'SAMALKHA',
      complaint_text: 'Complainant Ramesh Kumar Sharma states that on the night of 20/04/2026, unknown persons broke into his house and stole cash of Rs. 50,000, gold jewellery worth Rs. 2,00,000 and a mobile phone. The incident occurred while the family was away. He requests registration of FIR and investigation of the matter.',
      incident_place: 'H.No. 45, Village Samalkha, Panipat, Haryana', incident_date: '2026-04-20',
      status: 'pending'
    },
    {
      id: 'cmp-002', complaint_number: 'CMP/2026/0002',
      complainant_name: 'Sunita Devi', complainant_father_name: 'Mohan Lal',
      complainant_dob: '1978', complainant_nationality: 'INDIA',
      complainant_phone: '8765432109', complainant_occupation: 'Housewife',
      complainant_present_address: 'Ward No. 5, Rohtak City, Haryana',
      complainant_permanent_address: 'Ward No. 5, Rohtak City, Haryana',
      complainant_uid: '987654321098',
      district: 'ROHTAK', police_station: 'ROHTAK CITY',
      complaint_text: 'Complainant Sunita Devi states that her neighbour Dinesh Kumar has been harassing her family for the past 3 months regarding a property dispute. On 21/04/2026, he along with 2 other persons came to her house and abused and threatened her. She seeks police action against the accused persons.',
      incident_place: 'Ward No. 5, Near Bus Stand, Rohtak', incident_date: '2026-04-21',
      status: 'pending'
    },
    {
      id: 'cmp-003', complaint_number: 'CMP/2026/0003',
      complainant_name: 'Harpal Singh', complainant_father_name: 'Gurdev Singh',
      complainant_dob: '03/07/1979', complainant_nationality: 'INDIA',
      complainant_phone: '7654321098', complainant_occupation: 'Shopkeeper',
      complainant_present_address: 'Shop No. 12, Model Town, Ambala City, Haryana',
      complainant_permanent_address: 'H.No. 78, Sector-9, Ambala City, Haryana',
      complainant_uid: '456789012345',
      district: 'AMBALA', police_station: 'AMBALA CITY',
      complaint_text: 'Complainant Harpal Singh states that he runs a general store in Model Town Ambala. On 22/04/2026 at around 11:30 PM, two unknown persons came on a motorcycle and snatched his bag containing Rs. 35,000 cash and important documents near Model Town market. He could not identify the accused as they were wearing helmets.',
      incident_place: 'Near Model Town Market, Ambala City', incident_date: '2026-04-22',
      status: 'pending'
    },
    {
      id: 'cmp-004', complaint_number: 'CMP/2026/0004',
      complainant_name: 'Vijay Kumar Yadav', complainant_father_name: 'Ram Kishore Yadav',
      complainant_dob: '1990', complainant_nationality: 'INDIA',
      complainant_phone: '9988776655', complainant_occupation: 'Driver',
      complainant_present_address: 'Village Kundli, Sonipat, Haryana',
      complainant_permanent_address: 'Village Kundli, Sonipat, Haryana',
      complainant_uid: '321654987012',
      district: 'SONIPAT', police_station: 'KUNDLI',
      complaint_text: 'Complainant Vijay Kumar Yadav states that he was driving his truck (HR 01 GA 1234) when a group of 5 persons blocked his way near HSIDC area at night and forcibly took away goods worth Rs. 1,50,000 from his truck at gunpoint on 23/04/2026. He managed to escape and inform police.',
      incident_place: 'HSIDC Industrial Area, Kundli, Sonipat', incident_date: '2026-04-23',
      status: 'pending'
    },
    {
      id: 'cmp-005', complaint_number: 'CMP/2026/0005',
      complainant_name: 'Meena Kumari Agarwal', complainant_father_name: 'Shyam Lal Agarwal',
      complainant_dob: '22/11/1995', complainant_nationality: 'INDIA',
      complainant_phone: '9123456780', complainant_occupation: 'Teacher',
      complainant_present_address: 'Flat No. 303, Sector-14, Gurugram, Haryana',
      complainant_permanent_address: 'H.No. 5, Lajpat Nagar, Jind, Haryana',
      complainant_uid: '654321987654',
      district: 'GURUGRAM', police_station: 'SECTOR-14 GURUGRAM',
      complaint_text: 'Complainant Meena Kumari Agarwal states that she received a call from an unknown number claiming to be a bank official. The caller fraudulently obtained her ATM card details and OTP and transferred Rs. 75,000 from her savings account on 20/04/2026. She has bank transaction proof and call records available.',
      incident_place: 'Flat No. 303, Sector-14, Gurugram (Online Fraud)', incident_date: '2026-04-20',
      status: 'pending'
    },
  ];

  const txn = db.transaction((complaints) => {
    for (const c of complaints) insertComplaint.run(c);
  });
  txn(seedComplaints);
  console.log('Seed complaints created.');
}

export default db;
