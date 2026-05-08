const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

let db = null;

async function connect() {
  const keyPath            = process.env.FIREBASE_KEY_PATH;
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const projectId          = process.env.FIREBASE_PROJECT_ID;
  const clientEmail        = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey         = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!keyPath && !serviceAccountJson && !projectId) {
    console.log('  Firebase credentials not set — using JSON file storage');
    return false;
  }

  try {
    if (!admin.apps.length) {
      if (keyPath) {
        // Service account key file (local dev)
        const resolved = path.resolve(keyPath);
        const serviceAccount = JSON.parse(fs.readFileSync(resolved, 'utf8'));
        admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
      } else if (serviceAccountJson) {
        // Single JSON string env var
        admin.initializeApp({ credential: admin.credential.cert(JSON.parse(serviceAccountJson)) });
      } else if (clientEmail && privateKey) {
        // Individual env vars (recommended for Railway)
        admin.initializeApp({
          credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
        });
      } else {
        // Application Default Credentials (Firebase Functions / Cloud Run)
        admin.initializeApp({ projectId });
      }
    }

    db = admin.firestore();
    await db.collection('stores').limit(1).get(); // verify reachability
    console.log('  Connected to Firestore');
    return true;
  } catch (err) {
    db = null;
    console.warn(`  Firestore connection failed (${err.message}) — using JSON file storage`);
    return false;
  }
}

function getDb() { return db; }
function isConnected() { return db !== null; }

module.exports = { connect, getDb, isConnected };
