const admin = require('firebase-admin');
const fs = require('fs').promises;
const path = require('path');
const { getDb, isConnected } = require('./connection');

const DATA = path.join(__dirname, '..', 'data');

// Collection metadata: Firestore collection name + JSON fallback file
const COLS = {
  stores:      { col: 'stores',      file: 'stores.json' },
  users:       { col: 'users',       file: 'users.json' },
  lessonTypes: { col: 'lessonTypes', file: 'lesson-types.json' },
  lessons:     { col: 'lessons',     file: 'lessons.json' },
  adjustments: { col: 'adjustments', file: 'adjustments.json' },
};

// ── Tagged field-value helpers (storage-agnostic) ─────────
// Use these in server.js instead of MongoDB operators.
// Firestore adapter converts them to FieldValue; JSON adapter uses jsonUpdater.
const arrayUnion  = val => ({ __fv: 'arrayUnion',  val });
const arrayRemove = val => ({ __fv: 'arrayRemove', val });

function toFirestoreVal(v) {
  if (v && v.__fv === 'arrayUnion')  return admin.firestore.FieldValue.arrayUnion(v.val);
  if (v && v.__fv === 'arrayRemove') return admin.firestore.FieldValue.arrayRemove(v.val);
  return v;
}

function convertUpdate(obj) {
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, toFirestoreVal(v)]));
}

// ── Firestore doc → plain object ──────────────────────────
function toObj(doc) {
  if (!doc || !doc.exists) return null;
  return { id: doc.id, ...doc.data() };
}

// ── JSON fallback helpers ─────────────────────────────────
async function readJSON(file) {
  try {
    return JSON.parse(await fs.readFile(path.join(DATA, file), 'utf8'));
  } catch { return []; }
}

async function writeJSON(file, data) {
  await fs.writeFile(path.join(DATA, file), JSON.stringify(data, null, 2));
}

// Seed an empty Firestore collection from the JSON file (runs once on first connect)
async function seedCollection(name) {
  const { col, file } = COLS[name];
  const db = getDb();
  const snap = await db.collection(col).limit(1).get();
  if (!snap.empty) return;
  const data = await readJSON(file);
  if (!data.length) return;
  const batch = db.batch();
  data.forEach(({ id, ...rest }) => batch.set(db.collection(col).doc(id), rest));
  await batch.commit();
  console.log(`  Seeded ${name}: ${data.length} docs`);
}

// ── Public API ─────────────────────────────────────────────
module.exports = {
  arrayUnion,
  arrayRemove,

  async seedAll() {
    for (const name of Object.keys(COLS)) await seedCollection(name);
  },

  async find(name, filter = {}) {
    const { col, file } = COLS[name];
    if (isConnected()) {
      let query = getDb().collection(col);
      for (const [k, v] of Object.entries(filter)) query = query.where(k, '==', v);
      const snap = await query.get();
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }
    let list = await readJSON(file);
    for (const [k, v] of Object.entries(filter)) list = list.filter(d => d[k] === v);
    return list;
  },

  async findById(name, id) {
    const { col, file } = COLS[name];
    if (isConnected()) return toObj(await getDb().collection(col).doc(id).get());
    return (await readJSON(file)).find(d => d.id === id) || null;
  },

  async create(name, data) {
    const { col, file } = COLS[name];
    const { id, ...rest } = data;
    if (isConnected()) {
      await getDb().collection(col).doc(id).set(rest);
      return { id, ...rest };
    }
    const list = await readJSON(file);
    list.push(data);
    await writeJSON(file, list);
    return data;
  },

  async updateById(name, id, updates) {
    const { col, file } = COLS[name];
    const { id: _a, ...rest } = updates; // id is immutable
    if (isConnected()) {
      const ref = getDb().collection(col).doc(id);
      await ref.update(rest);
      return toObj(await ref.get());
    }
    const list = await readJSON(file);
    const i = list.findIndex(d => d.id === id);
    if (i === -1) return null;
    list[i] = { ...list[i], ...updates };
    await writeJSON(file, list);
    return list[i];
  },

  async deleteById(name, id) {
    const { col, file } = COLS[name];
    if (isConnected()) {
      await getDb().collection(col).doc(id).delete();
    } else {
      await writeJSON(file, (await readJSON(file)).filter(d => d.id !== id));
    }
    return true;
  },

  // For array operations and nested field updates.
  // firestoreUpdate: plain object using arrayUnion/arrayRemove tags or dot-notation keys
  //   e.g. { participants: arrayUnion(userId) }
  //   e.g. { 'availabilities.u01': ['2026-05-15'] }
  // jsonUpdater: function(item) mutates item in-place for JSON fallback
  async updateRaw(name, id, firestoreUpdate, jsonUpdater) {
    const { col, file } = COLS[name];
    if (isConnected()) {
      const ref = getDb().collection(col).doc(id);
      await ref.update(convertUpdate(firestoreUpdate));
      return toObj(await ref.get());
    }
    const list = await readJSON(file);
    const item = list.find(d => d.id === id);
    if (!item) return null;
    jsonUpdater(item);
    await writeJSON(file, list);
    return item;
  },
};
