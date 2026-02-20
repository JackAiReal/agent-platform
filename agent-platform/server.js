require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

const app = express();
const PORT = Number(process.env.PORT || 8001);
const HOST = process.env.HOST || '0.0.0.0';

const dataDir = path.join(__dirname, 'data');
const dbPath = path.join(dataDir, 'db.json');
const backupDir = path.join(dataDir, 'backups');
const uploadDir = path.join(__dirname, 'public', 'uploads');

for (const dir of [dataDir, backupDir, uploadDir]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
if (!fs.existsSync(dbPath)) {
  fs.writeFileSync(dbPath, JSON.stringify({ entries: [] }, null, 2));
}

function loadDb() {
  return JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
}
function saveDb(db) {
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
}

const DASHBOARD_USER = process.env.DASHBOARD_USER || 'admin';
const DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD || crypto.randomBytes(18).toString('base64url');
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(24).toString('hex');

if (!process.env.DASHBOARD_PASSWORD) {
  console.log('[agent-platform] DASHBOARD_PASSWORD not set, generated one-time password:');
  console.log(DASHBOARD_PASSWORD);
}

function parseCookies(req) {
  const cookieHeader = req.headers.cookie || '';
  const out = {};
  cookieHeader.split(';').forEach((part) => {
    const i = part.indexOf('=');
    if (i > 0) {
      out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
    }
  });
  return out;
}

function sign(text) {
  return crypto.createHmac('sha256', SESSION_SECRET).update(text).digest('hex');
}

function issueSession(user) {
  const exp = Date.now() + 7 * 24 * 60 * 60 * 1000;
  const payload = `${user}|${exp}`;
  const sig = sign(payload);
  return Buffer.from(`${payload}|${sig}`).toString('base64url');
}

function verifySession(token) {
  try {
    const raw = Buffer.from(token, 'base64url').toString('utf8');
    const [user, expStr, sig] = raw.split('|');
    if (!user || !expStr || !sig) return false;
    const payload = `${user}|${expStr}`;
    if (sign(payload) !== sig) return false;
    if (Date.now() > Number(expStr)) return false;
    return user === DASHBOARD_USER;
  } catch {
    return false;
  }
}

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));

app.get('/login', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (username !== DASHBOARD_USER || password !== DASHBOARD_PASSWORD) {
    return res.status(401).send('用户名或密码错误');
  }
  const token = issueSession(username);
  res.setHeader('Set-Cookie', `ap_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax`);
  return res.redirect('/');
});

app.post('/logout', (_req, res) => {
  res.setHeader('Set-Cookie', 'ap_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax');
  res.json({ ok: true });
});

app.use((req, res, next) => {
  if (req.path === '/login' || req.path === '/favicon.ico') return next();

  const cookies = parseCookies(req);
  const ok = cookies.ap_session && verifySession(cookies.ap_session);
  if (!ok) {
    if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Unauthorized' });
    return res.redirect('/login');
  }
  return next();
});

app.use(express.static(path.join(__dirname, 'public')));

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').slice(0, 10) || '.jpg';
    cb(null, `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}${ext}`);
  },
});
const upload = multer({ storage });

app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/api/upload', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'image is required' });
  return res.json({ ok: true, imageUrl: `/uploads/${req.file.filename}` });
});

app.get('/api/entries', (req, res) => {
  const type = String(req.query.type || '').trim();
  const keyword = String(req.query.q || '').trim().toLowerCase();
  const date = String(req.query.date || '').trim();
  const reviewStatus = String(req.query.reviewStatus || '').trim();
  const db = loadDb();

  let rows = type ? db.entries.filter((e) => e.type === type) : db.entries;

  if (keyword) {
    rows = rows.filter((e) =>
      `${e.title} ${e.content} ${e.reviewNote || ''} ${(e.tags || []).join(' ')}`.toLowerCase().includes(keyword)
    );
  }
  if (date) {
    rows = rows.filter((e) => (e.createdAt || '').slice(0, 10) === date);
  }
  if (reviewStatus) {
    rows = rows.filter((e) => (e.reviewStatus || 'pending') === reviewStatus);
  }

  rows.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return res.json({ entries: rows });
});

app.post('/api/entries', (req, res) => {
  const {
    type,
    title,
    content,
    goal,
    action,
    result,
    nextStep,
    imageUrl,
    costMoney,
    costTimeMinutes,
    tags,
  } = req.body || {};

  if (!['diary', 'output', 'cost'].includes(type)) {
    return res.status(400).json({ error: 'Invalid type' });
  }
  if (!title) return res.status(400).json({ error: 'title is required' });

  const diaryContent = [
    goal ? `目标: ${goal}` : '',
    action ? `动作: ${action}` : '',
    result ? `结果: ${result}` : '',
    nextStep ? `下一步: ${nextStep}` : '',
  ].filter(Boolean).join('\n');

  const finalContent = String(content || '').trim() || diaryContent;
  if (!finalContent) return res.status(400).json({ error: 'content is required' });

  const db = loadDb();
  const entry = {
    id: Date.now().toString(36),
    type,
    title: String(title).trim(),
    content: finalContent,
    goal: goal ? String(goal).trim() : '',
    action: action ? String(action).trim() : '',
    result: result ? String(result).trim() : '',
    nextStep: nextStep ? String(nextStep).trim() : '',
    reviewStatus: 'pending',
    reviewNote: '',
    imageUrl: imageUrl ? String(imageUrl).trim() : '',
    costMoney: Number(costMoney || 0),
    costTimeMinutes: Number(costTimeMinutes || 0),
    tags: Array.isArray(tags) ? tags : [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  db.entries.push(entry);
  saveDb(db);
  return res.json({ ok: true, entry });
});

app.patch('/api/entries/:id/review', (req, res) => {
  const { id } = req.params;
  const { reviewStatus, reviewNote } = req.body || {};
  if (!['pending', 'approved', 'rejected'].includes(reviewStatus)) {
    return res.status(400).json({ error: 'Invalid reviewStatus' });
  }

  const db = loadDb();
  const idx = db.entries.findIndex((e) => e.id === id);
  if (idx < 0) return res.status(404).json({ error: 'Entry not found' });

  db.entries[idx].reviewStatus = reviewStatus;
  db.entries[idx].reviewNote = String(reviewNote || '').trim();
  db.entries[idx].updatedAt = new Date().toISOString();
  saveDb(db);
  return res.json({ ok: true, entry: db.entries[idx] });
});

app.get('/api/summary', (_req, res) => {
  const db = loadDb();
  const diaryCount = db.entries.filter((e) => e.type === 'diary').length;
  const outputCount = db.entries.filter((e) => e.type === 'output').length;
  const costRows = db.entries.filter((e) => e.type === 'cost');
  const approvedCount = db.entries.filter((e) => e.reviewStatus === 'approved').length;
  const rejectedCount = db.entries.filter((e) => e.reviewStatus === 'rejected').length;
  const pendingCount = db.entries.filter((e) => (e.reviewStatus || 'pending') === 'pending').length;

  const totalMoney = costRows.reduce((sum, e) => sum + (Number(e.costMoney) || 0), 0);
  const totalTime = costRows.reduce((sum, e) => sum + (Number(e.costTimeMinutes) || 0), 0);

  res.json({
    diaryCount,
    outputCount,
    approvedCount,
    rejectedCount,
    pendingCount,
    totalMoney,
    totalTimeMinutes: totalTime,
  });
});

app.get('/api/timeline', (_req, res) => {
  const db = loadDb();
  const days = 14;
  const out = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const rows = db.entries.filter((e) => (e.createdAt || '').slice(0, 10) === key);
    out.push({
      date: key,
      diary: rows.filter((e) => e.type === 'diary').length,
      output: rows.filter((e) => e.type === 'output').length,
      cost: rows.filter((e) => e.type === 'cost').length,
      money: rows.filter((e) => e.type === 'cost').reduce((s, e) => s + (Number(e.costMoney) || 0), 0),
    });
  }
  res.json({ timeline: out });
});

app.get('/api/export.json', (_req, res) => {
  const db = loadDb();
  res.setHeader('Content-Disposition', `attachment; filename="agent-platform-export-${Date.now()}.json"`);
  res.json(db);
});

function runBackup() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  fs.copyFileSync(dbPath, path.join(backupDir, `db-${stamp}.json`));

  const files = fs.readdirSync(backupDir).filter((f) => f.endsWith('.json')).sort();
  const keep = 30;
  if (files.length > keep) {
    files.slice(0, files.length - keep).forEach((f) => {
      fs.unlinkSync(path.join(backupDir, f));
    });
  }
}

setInterval(runBackup, 24 * 60 * 60 * 1000);

app.listen(PORT, HOST, () => {
  runBackup();
  console.log(`Agent platform is running at http://${HOST}:${PORT}`);
  console.log(`Dashboard auth user: ${DASHBOARD_USER}`);
});
