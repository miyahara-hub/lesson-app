#!/usr/bin/env node
/**
 * Railway 環境変数セットアップスクリプト
 *
 * firebase-key.json から Firebase 認証情報を読み取り、
 * Railway のプロジェクト環境変数に一括設定します。
 *
 * 使い方:
 *   1. railway login && railway link   (事前にログイン・プロジェクト紐付け)
 *   2. node scripts/set-railway-env.js
 */

const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const KEY_PATH = path.join(ROOT, 'firebase-key.json');

if (!fs.existsSync(KEY_PATH)) {
  console.error('Error: firebase-key.json が見つかりません');
  process.exit(1);
}

const key = JSON.parse(fs.readFileSync(KEY_PATH, 'utf8'));

// private_key の改行を \n リテラルに変換（Railway の環境変数として保存するため）
// db/connection.js 側で .replace(/\\n/g, '\n') して復元する
const privateKeyEncoded = key.private_key.replace(/\n/g, '\\n');

const vars = {
  FIREBASE_PROJECT_ID:   key.project_id,
  FIREBASE_CLIENT_EMAIL: key.client_email,
  FIREBASE_PRIVATE_KEY:  privateKeyEncoded,
};

function setVar(k, v) {
  process.stdout.write(`  Setting ${k}... `);
  const result = spawnSync('railway', ['variables', 'set', `${k}=${v}`], {
    stdio: ['inherit', 'pipe', 'pipe'],
  });
  if (result.status !== 0) {
    console.error('FAILED');
    console.error(result.stderr?.toString());
    process.exit(1);
  }
  console.log('OK');
}

console.log('\nFirebase 認証情報を Railway に設定します...\n');
for (const [k, v] of Object.entries(vars)) setVar(k, v);

console.log('\n完了! 管理者パスワードも忘れずに設定してください:');
console.log('  railway variables set ADMIN_PASSWORD_SUPER="パスワード"');
console.log('  railway variables set ADMIN_PASSWORD_STORE="パスワード"');
