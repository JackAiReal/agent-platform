const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const app = express();
const PORT = Number(process.env.PORT || 8001);
const HOST = process.env.HOST || '0.0.0.0';

const dataDir = path.join(__dirname, 'data');
const dbPath = path.join(dataDir, 'db.json');
const uploadDir = path.join(__dirname, 'public', 'uploads');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
if (!fs.existsSync(dbPath)) {
  fs.writeFileSync(dbPath, JSON.stringify({ entries: [] }, null, 2));
}

function loadDb() {
  const raw = fs.readFileSync(dbPath, 'utf-8');
  return JSON.parse(raw);
}

function saveDb(db) {
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
}

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const safeExt = path.extname(file.originalname || '').slice(0, 10) || '.jpg';
    cb(null, `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}${safeExt}`);
  },
});
const upload = multer({ storage });

app.post('/api/upload', upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'image is required' });
  }
  res.json({
    ok: true,
    imageUrl: `/uploads/${req.file.filename}`,
  });
});

app.get('/api/entries', (req, res) => {
  const type = req.query.type;
  const keyword = String(req.query.q || '').trim().toLowerCase();
  const date = String(req.query.date || '').trim();
  const db = loadDb();

  let rows = type ? db.entries.filter((e) => e.type === type) : db.entries;

  if (keyword) {
    rows = rows.filter((e) =>
      `${e.title} ${e.content} ${(e.tags || []).join(' ')}`.toLowerCase().includes(keyword)
    );
  }

  if (date) {
    rows = rows.filter((e) => (e.createdAt || '').slice(0, 10) === date);
  }

  rows.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ entries: rows });
});

app.post('/api/entries', (req, res) => {
  const {
    type,
    title,
    content,
    imageUrl,
    costMoney,
    costTimeMinutes,
    tags,
  } = req.body || {};

  if (!['diary', 'output', 'cost'].includes(type)) {
    return res.status(400).json({ error: 'Invalid type' });
  }
  if (!title || !content) {
    return res.status(400).json({ error: 'title and content are required' });
  }

  const db = loadDb();
  const entry = {
    id: Date.now().toString(36),
    type,
    title: String(title).trim(),
    content: String(content).trim(),
    imageUrl: imageUrl ? String(imageUrl).trim() : '',
    costMoney: Number(costMoney || 0),
    costTimeMinutes: Number(costTimeMinutes || 0),
    tags: Array.isArray(tags) ? tags : [],
    createdAt: new Date().toISOString(),
  };

  db.entries.push(entry);
  saveDb(db);
  res.json({ ok: true, entry });
});

app.get('/api/summary', (req, res) => {
  const db = loadDb();
  const diaryCount = db.entries.filter((e) => e.type === 'diary').length;
  const outputCount = db.entries.filter((e) => e.type === 'output').length;
  const costRows = db.entries.filter((e) => e.type === 'cost');

  const totalMoney = costRows.reduce((sum, e) => sum + (Number(e.costMoney) || 0), 0);
  const totalTime = costRows.reduce((sum, e) => sum + (Number(e.costTimeMinutes) || 0), 0);

  res.json({
    diaryCount,
    outputCount,
    totalMoney,
    totalTimeMinutes: totalTime,
  });
});

app.listen(PORT, HOST, () => {
  console.log(`Agent platform is running at http://${HOST}:${PORT}`);
});
