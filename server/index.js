import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import db from './db.js';
import multer from 'multer';
import 'dotenv/config';
import { Groq } from 'groq-sdk';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

// Setup multer for memory storage
const upload = multer({ storage: multer.memoryStorage() });

const app = express();
const PORT = 3000;
const JWT_SECRET = 'local-dev-secret-haryana-police-123';

app.use(cors());
app.use(express.json());

// Helper middleware to verify token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (token == null) return res.sendStatus(401);

  jwt.verify(token, JWT_SECRET, (err, decodedUser) => {
    if (err) return res.sendStatus(403);
    
    // Fetch user from DB to get the latest station_id and role (handles old tokens)
    const dbUser = db.prepare('SELECT id, username, role, station_id FROM profiles WHERE id = ?').get(decodedUser.id);
    if (!dbUser) return res.sendStatus(403);
    
    req.user = dbUser;
    next();
  });
};

// Middleware: Access Control (IO sees only assigned FIRs, SHO sees only their station's FIRs)
const checkFirAccess = (req, res, next) => {
  const firId = req.params.id || req.params.fir_id;
  if (!firId) return next();

  if (req.user.role === 'io' || req.user.role === 'sho') {
    const fir = db.prepare('SELECT io_id, police_station FROM firs WHERE id = ?').get(firId);
    if (!fir) return res.status(404).json({ error: 'FIR not found' });
    
    if (req.user.role === 'io' && fir.io_id !== req.user.id) {
      return res.status(403).json({ error: 'Aap ko yeh FIR access karne ki permission nahi hai' });
    }
    
    if (req.user.role === 'sho' && req.user.station_id && fir.police_station !== req.user.station_id) {
      return res.status(403).json({ error: 'Aap keval apne police station ki FIR access kar sakte hain' });
    }
  }
  next();
};

// Login Route
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  const user = db.prepare('SELECT * FROM profiles WHERE username = ?').get(username);
  
  if (!user || user.password !== password) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  // Generate an access token
  const token = jwt.sign(
    { 
      id: user.id, 
      username: user.username,
      role: user.role
    }, 
    JWT_SECRET, 
    { expiresIn: '24h' }
  );

  // Return user details without password
  const { password: _, ...userData } = user;
  
  res.json({
    token,
    user: userData
  });
});

// Get Current User Profile
app.get('/api/auth/me', authenticateToken, (req, res) => {
  const user = db.prepare('SELECT * FROM profiles WHERE id = ?').get(req.user.id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  const { password: _, ...userData } = user;
  res.json(userData);
});

// =====================
// ADMIN USER MANAGEMENT
// =====================

// Middleware: Admin only
const requireAdmin = (req, res, next) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  next();
};

// GET /api/admin/users - List all users
app.get('/api/admin/users', authenticateToken, requireAdmin, (req, res) => {
  try {
    const { role, station_id, search } = req.query;
    let query = 'SELECT id, username, full_name, role, rank, badge_number, station_id, status, created_at FROM profiles WHERE 1=1';
    const params = [];
    if (role) { query += ' AND role = ?'; params.push(role); }
    if (station_id) { query += ' AND station_id = ?'; params.push(station_id); }
    if (search) { query += ' AND (full_name LIKE ? OR username LIKE ? OR station_id LIKE ?)'; params.push('%'+search+'%','%'+search+'%','%'+search+'%'); }
    query += ' ORDER BY role, station_id, username LIMIT 500';
    const users = db.prepare(query).all(...params);
    res.json(users);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/admin/users - Create new user
app.post('/api/admin/users', authenticateToken, requireAdmin, (req, res) => {
  try {
    const { username, password, full_name, role, rank, badge_number, station_id } = req.body;
    if (!username || !password || !full_name || !role) return res.status(400).json({ error: 'username, password, full_name, role are required' });
    const existing = db.prepare('SELECT id FROM profiles WHERE username = ?').get(username);
    if (existing) return res.status(409).json({ error: 'Username already exists' });
    const id = 'user-' + role.slice(0,3) + '-' + Date.now();
    db.prepare('INSERT INTO profiles (id, username, password, role, full_name, rank, badge_number, station_id, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(id, username, password, role, full_name, rank||'', badge_number||'', station_id||'', 'active');
    res.status(201).json({ id, message: 'User created successfully' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /api/admin/users/:id - Update user
app.patch('/api/admin/users/:id', authenticateToken, requireAdmin, (req, res) => {
  try {
    const { full_name, role, rank, badge_number, station_id, status, password } = req.body;
    const user = db.prepare('SELECT id FROM profiles WHERE id = ?').get(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const fields = []; const params = [];
    if (full_name !== undefined) { fields.push('full_name = ?'); params.push(full_name); }
    if (role !== undefined) { fields.push('role = ?'); params.push(role); }
    if (rank !== undefined) { fields.push('rank = ?'); params.push(rank); }
    if (badge_number !== undefined) { fields.push('badge_number = ?'); params.push(badge_number); }
    if (station_id !== undefined) { fields.push('station_id = ?'); params.push(station_id); }
    if (status !== undefined) { fields.push('status = ?'); params.push(status); }
    if (password) { fields.push('password = ?'); params.push(password); }
    if (fields.length === 0) return res.status(400).json({ error: 'Nothing to update' });
    params.push(req.params.id);
    db.prepare('UPDATE profiles SET ' + fields.join(', ') + ' WHERE id = ?').run(...params);
    res.json({ message: 'User updated successfully' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/admin/users/:id - Deactivate user
app.delete('/api/admin/users/:id', authenticateToken, requireAdmin, (req, res) => {
  try {
    const user = db.prepare('SELECT id, role FROM profiles WHERE id = ?').get(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.role === 'admin') return res.status(403).json({ error: 'Admin account cannot be deactivated' });
    db.prepare("UPDATE profiles SET status = 'inactive' WHERE id = ?").run(req.params.id);
    res.json({ message: 'User deactivated' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// =====================
// FIR ROUTES
// =====================

// Helper: generate FIR number (e.g. 0175 for 175th FIR in year 2026)
function generateFIRNumber(year) {
  const count = db.prepare('SELECT COUNT(*) as c FROM firs WHERE year = ?').get(year)?.c || 0;
  return String(count + 1).padStart(4, '0');
}

// GET /api/users - List users by role and optionally by station_id
app.get('/api/users', authenticateToken, (req, res) => {
  try {
    const { role, station_id } = req.query;
    let query = "SELECT id, full_name, rank, badge_number, station_id FROM profiles WHERE status = 'active'";
    const params = [];
    if (role) { query += ' AND role = ?'; params.push(role); }
    if (station_id) { query += ' AND station_id = ?'; params.push(station_id); }
    query += ' ORDER BY full_name';
    const users = db.prepare(query).all(...params);
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/users/lookup-sho - Public endpoint: find SHO username by police station (no auth needed for login page)
app.get('/api/users/lookup-sho', (req, res) => {
  try {
    const { station } = req.query;
    if (!station) return res.status(400).json({ error: 'station is required' });

    const sho = db.prepare(
      `SELECT username, full_name, rank, badge_number, station_id
       FROM profiles
       WHERE role = 'sho' AND station_id = ? AND status = 'active'
       LIMIT 1`
    ).get(station);

    if (!sho) return res.status(404).json({ error: 'SHO not found for this station' });

    res.json({
      username: sho.username,
      full_name: sho.full_name,
      rank: sho.rank,
      badge_number: sho.badge_number,
      station_id: sho.station_id,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/firs - List FIRs (IO only sees their assigned FIRs)
app.get('/api/firs', authenticateToken, (req, res) => {
  try {
    const { status, district, complaint_id, gd_entry_no } = req.query;
    let query = `
      SELECT f.id, f.fir_number, f.district, f.police_station, f.year,
             f.date_time_of_fir, f.acts_sections, f.complainant_name,
             f.place_address, f.status, f.io_name, f.io_rank, f.io_id,
             f.created_at, p.full_name as registered_by_name,
             f.complaint_id, f.gd_entry_no
      FROM firs f
      LEFT JOIN profiles p ON f.registered_by = p.id
      WHERE 1=1
    `;
    const params = [];

    // Role-based access: IO sees only assigned FIRs, SHO sees only their station's FIRs
    if (req.user.role === 'io') {
      query += ' AND f.io_id = ?';
      params.push(req.user.id);
    } else if (req.user.role === 'sho' && req.user.station_id) {
      query += ' AND f.police_station = ?';
      params.push(req.user.station_id);
    }

    if (status) {
      query += ' AND f.status = ?';
      params.push(status);
    }
    if (district) {
      query += ' AND f.district = ?';
      params.push(district);
    }
    if (complaint_id) {
      query += ' AND f.complaint_id = ?';
      params.push(complaint_id);
    }
    if (gd_entry_no) {
      query += ' AND f.gd_entry_no = ?';
      params.push(gd_entry_no);
    }

    query += ' ORDER BY f.created_at DESC';

    const firs = db.prepare(query).all(...params);
    res.json(firs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/firs - Register new FIR (SHO / Admin only)
app.post('/api/firs', authenticateToken, (req, res) => {
  const allowed = ['sho', 'admin'];
  if (!allowed.includes(req.user.role)) {
    return res.status(403).json({ error: 'केवल SHO या Admin ही FIR दर्ज कर सकते हैं' });
  }

  const d = req.body;
  const year = new Date().getFullYear();
  const firNumber = generateFIRNumber(year);
  const id = `fir-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  try {
    db.prepare(`
      INSERT INTO firs (
        id, fir_number, district, police_station, year, date_time_of_fir,
        acts_sections, occurrence_day, occurrence_date_from, occurrence_date_to,
        occurrence_time_period, occurrence_time_from, occurrence_time_to,
        info_received_date, info_received_time, gd_entry_no, gd_date_time,
        info_type, place_direction, place_distance, beat_no, place_address,
        latitude, longitude, outside_ps_name, outside_district,
        complainant_name, complainant_father_name, complainant_dob, complainant_nationality,
        complainant_uid, complainant_passport, complainant_id_details,
        complainant_occupation, complainant_present_address, complainant_permanent_address,
        complainant_phone, accused_details, delay_reason, property_details,
        total_property_value, fir_content, io_name, io_rank, io_no,
        refused_reason, transferred_ps, transferred_district,
        officer_name, officer_rank, officer_no, dispatch_date_time,
        registered_by, complaint_id, status
      ) VALUES (
        ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?
      )
    `).run(
      id, firNumber, d.district, d.police_station, year, d.date_time_of_fir,
      JSON.stringify(d.acts_sections || []),
      d.occurrence_day, d.occurrence_date_from, d.occurrence_date_to,
      d.occurrence_time_period, d.occurrence_time_from, d.occurrence_time_to,
      d.info_received_date, d.info_received_time, d.gd_entry_no, d.gd_date_time,
      d.info_type || 'Written',
      d.place_direction, d.place_distance, d.beat_no, d.place_address,
      d.latitude, d.longitude, d.outside_ps_name, d.outside_district,
      d.complainant_name, d.complainant_father_name, d.complainant_dob,
      d.complainant_nationality || 'INDIA', d.complainant_uid, d.complainant_passport,
      JSON.stringify(d.complainant_id_details || []),
      d.complainant_occupation, d.complainant_present_address, d.complainant_permanent_address,
      d.complainant_phone,
      JSON.stringify(d.accused_details || []),
      d.delay_reason,
      JSON.stringify(d.property_details || []),
      d.total_property_value || 0,
      d.fir_content,
      d.io_name, d.io_rank, d.io_no,
      d.refused_reason, d.transferred_ps, d.transferred_district,
      d.officer_name, d.officer_rank, d.officer_no, d.dispatch_date_time,
      req.user.id, d.complaint_id, 'under_investigation'
    );

    res.status(201).json({
      id,
      fir_number: firNumber,
      message: `FIR ${firNumber}/${year} registered successfully`,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/firs/stats/summary - Summary stats for M5 Case Analysis
app.get('/api/firs/stats/summary', authenticateToken, (req, res) => {
  try {
    const totalCount = db.prepare('SELECT COUNT(*) as c FROM firs').get().c;
    const byStatus = db.prepare('SELECT status, COUNT(*) as c FROM firs GROUP BY status').all();
    const byDistrict = db.prepare('SELECT district, COUNT(*) as c FROM firs GROUP BY district').all();

    const statusObj = {};
    byStatus.forEach(r => { statusObj[r.status] = r.c; });

    const districtObj = {};
    byDistrict.forEach(r => { districtObj[r.district] = r.c; });

    res.json({
      total: totalCount,
      by_status: statusObj,
      by_district: districtObj
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/firs/map/locations - Location data for M7 Crime Map
app.get('/api/firs/map/locations', authenticateToken, (req, res) => {
  try {
    const locations = db.prepare(`
      SELECT id, fir_number, place_address, district, police_station, date_time_of_fir, latitude, longitude
      FROM firs
      WHERE place_address IS NOT NULL AND place_address != ''
    `).all();
    res.json(locations);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/firs/search - Search across FIRs for M6 Smart Search
app.get('/api/firs/search', authenticateToken, (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.json([]);

    const searchTerm = `%${q}%`;
    const results = db.prepare(`
      SELECT id, fir_number, complainant_name, district, police_station, fir_content
      FROM firs
      WHERE fir_number LIKE ? OR complainant_name LIKE ? OR fir_content LIKE ?
      LIMIT 20
    `).all(searchTerm, searchTerm, searchTerm);
    
    // Format for M6 search module
    const formatted = results.map(r => ({
      id: r.id,
      fir_number: r.fir_number,
      complainant_name: r.complainant_name,
      module: 'fir' // So search module knows it's an FIR
    }));

    res.json(formatted);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/firs/:id/link-complaint - Link an existing M1 complaint to an FIR
app.patch('/api/firs/:id/link-complaint', authenticateToken, (req, res) => {
  try {
    const { complaint_id } = req.body;
    if (!complaint_id) return res.status(400).json({ error: 'complaint_id is required' });

    db.prepare('UPDATE firs SET complaint_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(complaint_id, req.params.id);
    res.json({ message: 'Complaint linked successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/firs/:id - Single FIR detail
app.get('/api/firs/:id', authenticateToken, (req, res) => {
  try {
    const fir = db.prepare(`
      SELECT f.*, p.full_name as registered_by_name, p.rank as registered_by_rank
      FROM firs f
      LEFT JOIN profiles p ON f.registered_by = p.id
      WHERE f.id = ?
    `).get(req.params.id);
    if (!fir) return res.status(404).json({ error: 'FIR not found' });

    // IO can only access FIRs assigned to them
    if (req.user.role === 'io' && fir.io_id !== req.user.id) {
      return res.status(403).json({ error: 'Aap ko yeh FIR access karne ki permission nahi hai' });
    }

    // SHO can only access FIRs of their police station
    if (req.user.role === 'sho' && req.user.station_id && fir.police_station !== req.user.station_id) {
      return res.status(403).json({ error: 'Aap keval apne police station ki FIR dekh sakte hain' });
    }

    res.json(fir);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/firs/:id/sections - Edit Acts & Sections (sho/admin only)
app.patch('/api/firs/:id/sections', authenticateToken, (req, res) => {
  if (!['sho', 'admin'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Only SHO or Admin can edit Acts & Sections' });
  }
  const { acts_sections } = req.body;
  if (!Array.isArray(acts_sections) || acts_sections.length === 0) {
    return res.status(400).json({ error: 'At least one Act & Section entry is required' });
  }
  const valid = acts_sections.filter(r => r.act && r.act.trim());
  if (valid.length === 0) {
    return res.status(400).json({ error: 'At least one valid Act is required' });
  }
  try {
    db.prepare(
      'UPDATE firs SET acts_sections = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).run(JSON.stringify(valid), req.params.id);
    res.json({ message: 'Acts & Sections updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/firs/:id/transfer - Transfer FIR to another police station (admin only)
app.patch('/api/firs/:id/transfer', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Only Admin can transfer a FIR to another police station' });
  }
  const { district, police_station, transfer_reason } = req.body;
  if (!district || !police_station) {
    return res.status(400).json({ error: 'district and police_station are required' });
  }
  try {
    // Ensure transfer columns exist (migrate on-the-fly for existing DBs)
    const cols = db.pragma('table_info(firs)').map(c => c.name);
    if (!cols.includes('transferred_from_district')) {
      db.exec('ALTER TABLE firs ADD COLUMN transferred_from_district TEXT;');
    }
    if (!cols.includes('transferred_from_ps')) {
      db.exec('ALTER TABLE firs ADD COLUMN transferred_from_ps TEXT;');
    }
    if (!cols.includes('transfer_reason')) {
      db.exec('ALTER TABLE firs ADD COLUMN transfer_reason TEXT;');
    }

    // Fetch current location for audit trail
    const current = db.prepare('SELECT district, police_station FROM firs WHERE id = ?').get(req.params.id);
    if (!current) return res.status(404).json({ error: 'FIR not found' });

    db.prepare(`
      UPDATE firs
      SET district = ?, police_station = ?,
          transferred_from_district = ?, transferred_from_ps = ?,
          transfer_reason = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(district, police_station, current.district, current.police_station, transfer_reason || null, req.params.id);

    res.json({ message: `FIR transferred to ${police_station}, ${district}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/firs/:id/assign-io - Reassign Investigating Officer (sho/admin only)
app.patch('/api/firs/:id/assign-io', authenticateToken, (req, res) => {
  if (!['sho', 'admin'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Only SHO or Admin can change the Investigating Officer' });
  }
  const { io_id, io_name, io_rank, io_no } = req.body;
  if (!io_name || !io_rank) {
    return res.status(400).json({ error: 'IO name and rank are required' });
  }
  try {
    db.prepare(
      'UPDATE firs SET io_id = ?, io_name = ?, io_rank = ?, io_no = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).run(io_id || null, io_name, io_rank, io_no || null, req.params.id);
    res.json({ message: 'Investigating Officer updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/firs/:id/status - Update FIR status (sho/admin only)
app.patch('/api/firs/:id/status', authenticateToken, (req, res) => {
  if (!['sho', 'admin'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Only SHO or Admin can update FIR status' });
  }
  const { status } = req.body;
  const validStatuses = ['under_investigation', 'chargesheeted', 'closed'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid status value' });
  }
  db.prepare('UPDATE firs SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(status, req.params.id);
  res.json({ message: 'Status updated successfully' });
});

// POST /api/firs/extract-pdf - Extract FIR details from PDF/Image using Groq
app.post('/api/firs/extract-pdf', authenticateToken, upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  try {
    let extractedText = '';

    if (req.file.mimetype === 'application/pdf') {
      const data = await pdfParse(req.file.buffer);
      extractedText = data.text;
    } else if (req.file.mimetype.startsWith('image/')) {
      // For images, we use tesseract.js to extract text
      const tesseract = require('tesseract.js');
      const { data: { text } } = await tesseract.recognize(req.file.buffer, 'eng+hin');
      extractedText = text;
    } else {
      return res.status(400).json({ error: 'Unsupported file type. Please upload a PDF or Image.' });
    }

    if (!extractedText || extractedText.trim().length === 0) {
      throw new Error("Could not extract any text from the document.");
    }

    // Now send the extracted text to Groq to format it into JSON
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const extractionPrompt = `
You are a police data extraction assistant. Extract the following fields from the given complaint text and return ONLY a valid JSON object. 
If a field is not found, leave it empty or null.

Fields to extract:
- complainant_name (string)
- complainant_father_name (string)
- complainant_phone (string)
- complainant_present_address (string)
- district (string - try to guess from address if possible)
- police_station (string - try to guess from text if possible)
- place_address (string - the address where the incident occurred)
- fir_content (string - a concise narrative summary of the complaint, translating to English if needed)
- date_time_of_fir (string - ISO format of today's date)

Text:
"""
${extractedText}
"""
`;

    const jsonCompletion = await groq.chat.completions.create({
      messages: [{ role: "user", content: extractionPrompt }],
      model: "llama-3.3-70b-versatile",
      temperature: 0,
      response_format: { type: "json_object" }
    });

    const parsedData = JSON.parse(jsonCompletion.choices[0].message.content);
    // Ensure date_time_of_fir is set to now if not properly extracted
    if (!parsedData.date_time_of_fir) {
      parsedData.date_time_of_fir = new Date().toISOString();
    }

    res.json(parsedData);
  } catch (error) {
    console.error("Extraction error:", error);
    res.status(500).json({ error: "Failed to extract data: " + error.message });
  }
});

// =====================
// COMPLAINTS ROUTES
// =====================

// GET /api/complaints - List all complaints (searchable)
app.get('/api/complaints', authenticateToken, (req, res) => {
  try {
    const { q, status } = req.query;
    let query = `SELECT * FROM complaints WHERE 1=1`;
    const params = [];

    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }
    if (q) {
      query += ' AND (complainant_name LIKE ? OR complaint_number LIKE ? OR district LIKE ? OR complainant_phone LIKE ?)';
      const term = `%${q}%`;
      params.push(term, term, term, term);
    }
    query += ' ORDER BY created_at DESC';

    const complaints = db.prepare(query).all(...params);
    res.json(complaints);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/complaints/:id - Single complaint for auto-fill
app.get('/api/complaints/:id', authenticateToken, (req, res) => {
  try {
    const complaint = db.prepare('SELECT * FROM complaints WHERE id = ?').get(req.params.id);
    if (!complaint) return res.status(404).json({ error: 'Complaint not found' });
    res.json(complaint);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/complaints/:id/status - Mark complaint as converted to FIR
app.patch('/api/complaints/:id/status', authenticateToken, (req, res) => {
  try {
    const { status } = req.body;
    db.prepare('UPDATE complaints SET status = ? WHERE id = ?').run(status, req.params.id);
    res.json({ message: 'Complaint status updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =====================
// INVESTIGATION ROUTES
// =====================

// CDRs
app.get('/api/firs/:id/cdrs', authenticateToken, checkFirAccess, (req, res) => {
  try {
    const cdrs = db.prepare('SELECT * FROM cdr_requests WHERE fir_id = ? ORDER BY updated_at DESC').all(req.params.id);
    res.json(cdrs);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/firs/:id/cdrs', authenticateToken, checkFirAccess, (req, res) => {
  try {
    const { phone_number, tsp_name } = req.body;
    const cid = `cdr-${Date.now()}`;
    db.prepare(`
      INSERT INTO cdr_requests (id, fir_id, phone_number, tsp_name, requested_by)
      VALUES (?, ?, ?, ?, ?)
    `).run(cid, req.params.id, phone_number, tsp_name, req.user.id);
    res.json({ id: cid, message: 'CDR Requested', status: 'requested' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/cdrs/:id/status', authenticateToken, (req, res) => {
  try {
    const { status } = req.body;
    db.prepare('UPDATE cdr_requests SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(status, req.params.id);
    res.json({ message: 'Status updated' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Arrests
app.get('/api/firs/:id/arrests', authenticateToken, checkFirAccess, (req, res) => {
  try {
    const arrests = db.prepare('SELECT * FROM arrests WHERE fir_id = ? ORDER BY created_at DESC').all(req.params.id);
    res.json(arrests);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/firs/:id/arrests', authenticateToken, checkFirAccess, (req, res) => {
  try {
    const {
      accused_name,
      accused_address,
      date_of_arrest,
      arrest_place,
      arresting_officer_name,
      arresting_officer_rank,
      arresting_officer_badge,
      arresting_officer_post,
      informed_person_name,
      informed_person_address,
      informed_person_phone,
      witness_name,
      witness_post
    } = req.body;

    const aid = `arr-${Date.now()}`;

    db.prepare(`
      INSERT INTO arrests (
        id, fir_id, accused_name, accused_address, date_of_arrest, arrest_place,
        arresting_officer_name, arresting_officer_rank, arresting_officer_badge, arresting_officer_post,
        informed_person_name, informed_person_address, informed_person_phone,
        witness_name, witness_post
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      aid, req.params.id, accused_name, accused_address, date_of_arrest, arrest_place,
      arresting_officer_name, arresting_officer_rank, arresting_officer_badge, arresting_officer_post,
      informed_person_name, informed_person_address, informed_person_phone,
      witness_name, witness_post
    );

    res.json({ id: aid, message: 'Arrest Recorded & Memo Generated' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Notices
app.get('/api/firs/:id/notices', authenticateToken, checkFirAccess, (req, res) => {
  try {
    const notices = db.prepare('SELECT * FROM notices WHERE fir_id = ? ORDER BY created_at DESC').all(req.params.id);
    res.json(notices);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/firs/:id/notices', authenticateToken, checkFirAccess, (req, res) => {
  try {
    const { notice_type, details } = req.body;
    const nid = `not-${Date.now()}`;
    
    // Fetch FIR details for actual legal notice formatting
    const fir = db.prepare(`SELECT * FROM firs WHERE id = ?`).get(req.params.id);
    if (!fir) return res.status(404).json({ error: 'FIR not found' });
    
    let sections = '—';
    try {
      const parsed = JSON.parse(fir.acts_sections || '[]');
      sections = parsed.map(s => `${s.sections} ${s.act}`).join(', ');
    } catch (e) {}

    let accusedStr = '—';
    try {
      const parsedAcc = JSON.parse(fir.accused_details || '[]');
      if (parsedAcc.length > 0) {
        accusedStr = parsedAcc.map(a => a.name).filter(Boolean).join(', ');
      }
    } catch (e) {}

    const firDate = fir.date_time_of_fir ? new Date(fir.date_time_of_fir).toLocaleDateString('hi-IN') : '—';
    const noticeDate = new Date().toLocaleDateString('hi-IN');
    
    const content = `तलाश वारंट / तलाशी व जब्ती नोटिस (धारा 93/94 B.N.S.S.)
=========================================================

थाना: ${fir.police_station || '—'}
जिला: ${fir.district || '—'}
FIR संख्या: ${fir.fir_number || '—'} / ${fir.year || '—'}
दिनाँक: ${firDate}
धाराएं: ${sections}

मामले का विवरण:
शिकायतकर्ता: ${fir.complainant_name || '—'}
बनाम: ${accusedStr}

नोटिस का प्रकार: ${notice_type.toUpperCase()}
---------------------------------------------------------
यह नोटिस निम्नलिखित स्थान/परिसर की तलाशी के संबंध में जारी किया जा रहा है:
स्थान व विवरण: ${details}

चूंकि ऊपर वर्णित मामले की जांच/अनुसंधान के लिए यह आवश्यक है कि उपर्युक्त स्थान की तलाशी ली जाए, अतः आपको सूचित किया जाता है कि पुलिस टीम द्वारा इस स्थान का निरीक्षण व तलाशी ली जाएगी। कृपया सहयोग करें।

जारी करने की तिथि: ${noticeDate}

अधिकारी के हस्ताक्षर: ____________________
नाम/पद: ____________________
=========================================================`;

    db.prepare(`
      INSERT INTO notices (id, fir_id, notice_type, content)
      VALUES (?, ?, ?, ?)
    `).run(nid, req.params.id, notice_type, content);
    
    res.json({ id: nid, message: 'Notice Generated' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Evidences
app.get('/api/firs/:id/evidences', authenticateToken, checkFirAccess, (req, res) => {
  try {
    const evidences = db.prepare('SELECT * FROM evidences WHERE fir_id = ? ORDER BY created_at DESC').all(req.params.id);
    res.json(evidences);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/firs/:id/evidences', authenticateToken, checkFirAccess, (req, res) => {
  try {
    const {
      description,
      location,
      extra_details,
      media_file,
      item_id,
      seizure_date,
      seizure_place,
      witness_name,
      witness_badge,
      witness_post,
      officer_post,
      seizure_narrative
    } = req.body;
    const eid = `evd-${Date.now()}`;

    // migrate new columns if not present
    const tInfo = db.pragma('table_info(evidences)');
    const cols = tInfo.map(c => c.name);
    const newCols = [
      ['item_id','TEXT'], ['seizure_date','TEXT'], ['seizure_place','TEXT'],
      ['witness_name','TEXT'], ['witness_badge','TEXT'], ['witness_post','TEXT'],
      ['officer_post','TEXT'], ['seizure_narrative','TEXT']
    ];
    for (const [col, type] of newCols) {
      if (!cols.includes(col)) {
        db.exec(`ALTER TABLE evidences ADD COLUMN ${col} ${type};`);
      }
    }

    db.prepare(`
      INSERT INTO evidences (
        id, fir_id, description, location, extra_details, media_file,
        item_id, seizure_date, seizure_place,
        witness_name, witness_badge, witness_post,
        officer_post, seizure_narrative
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      eid, req.params.id, description, location, extra_details, media_file,
      item_id, seizure_date, seizure_place,
      witness_name, witness_badge, witness_post,
      officer_post, seizure_narrative
    );
    res.json({ id: eid, message: 'Evidence Recorded and Seizure Memo Generated' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Challans
app.get('/api/firs/:id/challans', authenticateToken, checkFirAccess, (req, res) => {
  try {
    const challans = db.prepare('SELECT * FROM challans WHERE fir_id = ? ORDER BY generated_at DESC').all(req.params.id);
    res.json(challans);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/firs/:id/challans', authenticateToken, checkFirAccess, (req, res) => {
  try {
    const { io_notes } = req.body;
    const chid = `chal-${Date.now()}`;
    const reportText = `FINAL REPORT UNDER SECTION 173 CRPC\\nFIR ID: ${req.params.id}\\nIO Remarks: ${io_notes}\\nTimestamp: ${new Date().toISOString()}`;
    db.prepare(`
      INSERT INTO challans (id, fir_id, io_notes, final_report)
      VALUES (?, ?, ?, ?)
    `).run(chid, req.params.id, io_notes, reportText);
    
    // Auto-update FIR status to chargesheeted
    db.prepare('UPDATE firs SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('chargesheeted', req.params.id);
    
    res.json({ id: chid, message: 'Challan Generated successfully' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Case Diaries
app.get('/api/firs/:id/case-diaries', authenticateToken, checkFirAccess, (req, res) => {
  try {
    const diaries = db.prepare('SELECT * FROM case_diaries WHERE fir_id = ? ORDER BY created_at DESC').all(req.params.id);
    res.json(diaries);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/firs/:id/case-diaries', authenticateToken, checkFirAccess, (req, res) => {
  try {
    const { entry_text } = req.body;
    const cdid = `cd-${Date.now()}`;
    db.prepare(`
      INSERT INTO case_diaries (id, fir_id, entry_text)
      VALUES (?, ?, ?)
    `).run(cdid, req.params.id, entry_text);
    res.json({ id: cdid, message: 'Case Diary Entry Added Successfully' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.listen(PORT, () => {
  console.log(`Backend API running on http://localhost:${PORT}`);
});
