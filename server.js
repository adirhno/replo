require('dotenv').config();
const express = require('express');
const path = require('path');
const { MongoClient } = require('mongodb');

const PORT = process.env.PORT || 3006;
const ADMIN_KEY = process.env.ADMIN_KEY;
if (!process.env.MONGODB_URI || !ADMIN_KEY) {
  console.error('Missing MONGODB_URI or ADMIN_KEY (see .env.example)');
  process.exit(1);
}

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname, 'public')));

const client = new MongoClient(process.env.MONGODB_URI);
let signups, visits;

// simple rate limit: 5 sign-ups per IP per hour
const hits = new Map();
const limited = ip => {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter(t => now - t < 3600e3);
  list.push(now);
  hits.set(ip, list);
  return list.length > 5;
};
const clean = (v, n) => String(v || '').trim().slice(0, n);

// page view (one per visitor id)
app.post('/api/visit', async (req, res) => {
  const sid = clean(req.body.sid, 60);
  if (!sid) return res.status(400).end();
  try {
    await visits.updateOne(
      { sid },
      { $setOnInsert: { sid, source: clean(req.body.source, 60) || 'direct', at: new Date() } },
      { upsert: true }
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ ok: false }); }
});

// the form posts here
app.post('/api/signup', async (req, res) => {
  if (limited(req.ip)) return res.status(429).json({ ok: false });
  const name = clean(req.body.name, 100);
  const contact = clean(req.body.contact, 150);
  if (!name || !contact) return res.status(400).json({ ok: false });
  try {
    await signups.insertOne({
      name, contact,
      type: clean(req.body.type, 60),
      sid: clean(req.body.sid, 60),
      source: clean(req.body.source, 60) || 'direct',
      at: new Date()
    });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ ok: false }); }
});

const auth = (req, res, next) =>
  req.query.key === ADMIN_KEY ? next() : res.status(401).send('Unauthorized');

// how much interest: /admin/stats?key=YOUR_KEY
app.get('/admin/stats', auth, async (req, res) => {
  const [v, s, vSrc, sSrc] = await Promise.all([
    visits.countDocuments(),
    signups.countDocuments(),
    visits.aggregate([{ $group: { _id: '$source', visitors: { $sum: 1 } } }]).toArray(),
    signups.aggregate([{ $group: { _id: '$source', signups: { $sum: 1 } } }]).toArray()
  ]);
  const bySource = {};
  vSrc.forEach(x => (bySource[x._id] = { visitors: x.visitors, signups: 0 }));
  sSrc.forEach(x => {
    bySource[x._id] = bySource[x._id] || { visitors: 0, signups: 0 };
    bySource[x._id].signups = x.signups;
  });
  res.json({
    visitors: v,
    signups: s,
    conversionPercent: v ? +((s / v) * 100).toFixed(1) : 0,
    bySource
  });
});

// the people who signed up: /admin/signups?key=YOUR_KEY
app.get('/admin/signups', auth, async (req, res) => {
  const rows = await signups.find({}, { projection: { _id: 0 } }).sort({ at: -1 }).toArray();
  res.json({ count: rows.length, rows });
});

(async () => {
  await client.connect();
  const db = client.db(process.env.DB_NAME || 'lexreply');
  signups = db.collection('signups');
  visits = db.collection('visits');
  await visits.createIndex({ sid: 1 }, { unique: true });
  app.listen(PORT, () => console.log('Running on http://localhost:' + PORT));
})().catch(e => { console.error(e); process.exit(1); });
