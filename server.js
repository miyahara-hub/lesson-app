require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { connect } = require('./db/connection');
const storage = require('./db/storage');
const { arrayUnion, arrayRemove } = storage;

const app = express();
const PORT = process.env.PORT || 3000;

// CORS: allow Firebase Hosting, Railway, and localhost
const CORS_ALLOWED = [
  /^http:\/\/localhost/,
  /\.web\.app$/,
  /\.firebaseapp\.com$/,
  /\.up\.railway\.app$/,
  /\.onrender\.com$/,
];
if (process.env.CORS_ORIGIN) {
  CORS_ALLOWED.push(new RegExp(process.env.CORS_ORIGIN));
}
app.use(cors({
  origin(origin, cb) {
    if (!origin || CORS_ALLOWED.some(re => re.test(origin))) return cb(null, true);
    cb(new Error(`CORS: ${origin} not allowed`));
  },
  credentials: true,
}));

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const ID_PREFIXES = {
  stores: 'store', users: 'user', lessonTypes: 'lt',
  lessons: 'lesson', adjustments: 'adj',
};

function newId(col) {
  return `${ID_PREFIXES[col]}_${uuidv4().slice(0, 8)}`;
}

// ── Generic CRUD ─────────────────────────────────────────
function crudRoutes(route, col) {
  app.get(route, async (_, res) => {
    try { res.json(await storage.find(col)); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post(route, async (req, res) => {
    try {
      res.json(await storage.create(col, { id: newId(col), ...req.body }));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.put(`${route}/:id`, async (req, res) => {
    try {
      const item = await storage.updateById(col, req.params.id, req.body);
      if (!item) return res.status(404).json({ error: 'Not found' });
      res.json(item);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.delete(`${route}/:id`, async (req, res) => {
    try {
      await storage.deleteById(col, req.params.id);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
}

// ── STORES / USERS / LESSON-TYPES ────────────────────────
crudRoutes('/api/stores', 'stores');
crudRoutes('/api/users', 'users');
crudRoutes('/api/lesson-types', 'lessonTypes');

// ── LESSONS ──────────────────────────────────────────────
app.get('/api/lessons', async (req, res) => {
  try {
    const filter = {};
    if (req.query.storeId) filter.storeId = req.query.storeId;
    let list = await storage.find('lessons', filter);
    if (req.query.month && req.query.year) {
      list = list.filter(l => {
        const d = new Date(l.date + 'T00:00:00');
        return d.getMonth() + 1 === +req.query.month && d.getFullYear() === +req.query.year;
      });
    }
    res.json(list);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/lessons', async (req, res) => {
  try {
    res.json(await storage.create('lessons', {
      id: newId('lessons'),
      participants: [],
      createdAt: new Date().toISOString(),
      ...req.body,
    }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/lessons/:id', async (req, res) => {
  try {
    const { participants, ...updates } = req.body;
    const item = await storage.updateById('lessons', req.params.id, updates);
    if (!item) return res.status(404).json({ error: 'Not found' });
    res.json(item);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/lessons/:id', async (req, res) => {
  try {
    await storage.deleteById('lessons', req.params.id);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/lessons/:id/register', async (req, res) => {
  try {
    const lesson = await storage.findById('lessons', req.params.id);
    if (!lesson) return res.status(404).json({ error: 'Not found' });

    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId required' });
    if (lesson.participants.includes(userId))
      return res.status(400).json({ error: 'Already registered' });
    if (lesson.participants.length >= lesson.capacity)
      return res.status(400).json({ error: 'Lesson is full' });

    const daysBefore = { '1day':1,'3days':3,'1week':7,'2weeks':14,'1month':30 };
    const dl = new Date(lesson.date + 'T23:59:59');
    dl.setDate(dl.getDate() - (daysBefore[lesson.deadline] || 0));
    if (new Date() > dl)
      return res.status(400).json({ error: 'Registration deadline has passed' });

    res.json(await storage.updateRaw('lessons', req.params.id,
      { participants: arrayUnion(userId) },
      item => item.participants.push(userId)
    ));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/lessons/:id/register/:userId', async (req, res) => {
  try {
    const updated = await storage.updateRaw('lessons', req.params.id,
      { participants: arrayRemove(req.params.userId) },
      item => { item.participants = item.participants.filter(id => id !== req.params.userId); }
    );
    if (!updated) return res.status(404).json({ error: 'Not found' });
    res.json(updated);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── ADJUSTMENTS ──────────────────────────────────────────
app.get('/api/adjustments', async (req, res) => {
  try {
    const filter = {};
    if (req.query.storeId) filter.storeId = req.query.storeId;
    res.json(await storage.find('adjustments', filter));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/adjustments', async (req, res) => {
  try {
    res.json(await storage.create('adjustments', {
      id: newId('adjustments'),
      availabilities: {},
      candidates: [],
      votes: {},
      status: 'open',
      createdAt: new Date().toISOString(),
      ...req.body,
    }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/adjustments/:id', async (req, res) => {
  try {
    const item = await storage.updateById('adjustments', req.params.id, req.body);
    if (!item) return res.status(404).json({ error: 'Not found' });
    res.json(item);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/adjustments/:id', async (req, res) => {
  try {
    await storage.deleteById('adjustments', req.params.id);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/adjustments/:id/availability', async (req, res) => {
  try {
    const { userId, dates = [] } = req.body;
    const updated = await storage.updateRaw('adjustments', req.params.id,
      { [`availabilities.${userId}`]: dates },
      item => { item.availabilities[userId] = dates; }
    );
    if (!updated) return res.status(404).json({ error: 'Not found' });
    res.json(updated);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/adjustments/:id/candidates', async (req, res) => {
  try {
    const dates = req.body.dates || [];
    const updated = await storage.updateRaw('adjustments', req.params.id,
      { candidates: dates },
      item => { item.candidates = dates; }
    );
    if (!updated) return res.status(404).json({ error: 'Not found' });
    res.json(updated);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/adjustments/:id/vote', async (req, res) => {
  try {
    const { userId, dates = [] } = req.body;
    const updated = await storage.updateRaw('adjustments', req.params.id,
      { [`votes.${userId}`]: dates },
      item => { item.votes[userId] = dates; }
    );
    if (!updated) return res.status(404).json({ error: 'Not found' });
    res.json(updated);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── ADMIN AUTH ───────────────────────────────────────────
app.post('/api/admin/auth', (req, res) => {
  const { password, adminRole } = req.body;
  if (!password || !adminRole)
    return res.status(400).json({ error: 'パラメーターが不足しています' });

  const correct =
    (adminRole === 'super_admin' && password === process.env.ADMIN_PASSWORD_SUPER) ||
    (adminRole === 'store_admin' && password === process.env.ADMIN_PASSWORD_STORE);

  if (correct) return res.json({ ok: true });
  return res.status(401).json({ error: 'パスワードが正しくありません' });
});

// ── STATS ────────────────────────────────────────────────
app.get('/api/stats', async (req, res) => {
  try {
    const filter = {};
    if (req.query.storeId) filter.storeId = req.query.storeId;
    const lessons = await storage.find('lessons', filter);

    const instructorStats = {};
    const participantStats = {};
    lessons.forEach(l => {
      instructorStats[l.instructorId] = instructorStats[l.instructorId] ||
        { lessonCount: 0, participantCount: 0 };
      instructorStats[l.instructorId].lessonCount++;
      instructorStats[l.instructorId].participantCount += l.participants.length;
      l.participants.forEach(uid => {
        participantStats[uid] = (participantStats[uid] || 0) + 1;
      });
    });

    res.json({
      totalLessons: lessons.length,
      totalParticipants: lessons.reduce((s, l) => s + l.participants.length, 0),
      instructorStats,
      participantStats,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── INITIALIZATION ────────────────────────────────────────
const initPromise = (async () => {
  const ok = await connect();
  if (ok) await storage.seedAll();
})();

// ── Firebase Cloud Functions export (Gen2) ───────────────
// Used when deploying via: firebase deploy
// Region: asia-northeast1 (Tokyo) for low latency
try {
  const { onRequest } = require('firebase-functions/v2/https');
  module.exports.app = onRequest(
    { region: 'asia-northeast1' },
    async (req, res) => {
      await initPromise;
      return app(req, res);
    }
  );
} catch (_) {
  // firebase-functions not available — running locally or on Railway
}

// ── Local dev / Railway ───────────────────────────────────
if (require.main === module) {
  initPromise.then(() =>
    app.listen(PORT, () =>
      console.log(`\n  Lesson App running at http://localhost:${PORT}\n`)
    )
  );
}
