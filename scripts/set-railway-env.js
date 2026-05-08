#!/usr/bin/env node
/**
 * Railway 環境変数セットアップスクリプト
 * firebase-key.json から Firebase 認証情報を読み取り Railway に一括設定します。
 *
 * 事前準備:
 *   railway login
 *   railway link  （GitHub 連携済みプロジェクトを選択）
 *
 * 実行:
 *   node scripts/set-railway-env.js
 */

const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const KEY_PATH = path.join(ROOT, 'firebase-key.json');

// ── 事前チェック ─────────────────────────────────────────
function run(args) {
  return spawnSync('railway', args, { encoding: 'utf8' });
}

const statusResult = run(['status']);
if (statusResult.status !== 0) {
  console.error('Railway にログインしていないか、プロジェクトが紐付けられていません。');
  console.error('以下を実行してから再試行してください:');
  console.error('  railway login');
  console.error('  railway link');
  process.exit(1);
}
console.log(statusResult.stdout.trim());

if (!fs.existsSync(KEY_PATH)) {
  console.error('\nError: firebase-key.json がプロジェクトルートに見つかりません');
  process.exit(1);
}

// ── 認証情報を読み取り ────────────────────────────────────
const key = JSON.parse(fs.readFileSync(KEY_PATH, 'utf8'));

// private_key の改行を \n リテラルに変換して保存
// db/connection.js 内の .replace(/\\n/g, '\n') で実行時に復元される
const privateKeyEncoded = key.private_key.replace(/\n/g, '\\n');

const vars = {
  FIREBASE_PROJECT_ID:   key.project_id,
  FIREBASE_CLIENT_EMAIL: key.client_email,
  FIREBASE_PRIVATE_KEY:  privateKeyEncoded,
};

// ── 環境変数を設定 ────────────────────────────────────────
function setVar(name, value) {
  process.stdout.write(`  ${name} ... `);
  const result = spawnSync('railway', ['variables', 'set', `${name}=${value}`], {
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    console.error('FAILED');
    console.error(result.stderr || result.stdout);
    process.exit(1);
  }
  console.log('OK');
}

console.log('\nFirebase 認証情報を Railway に設定します...\n');
for (const [name, value] of Object.entries(vars)) setVar(name, value);

// ── 完了メッセージ ────────────────────────────────────────
console.log('\n✓ Firebase 認証情報の設定が完了しました');
console.log('\n管理者パスワードも設定してください:');
console.log('  railway variables set ADMIN_PASSWORD_SUPER="パスワード"');
console.log('  railway variables set ADMIN_PASSWORD_STORE="パスワード"');
console.log('\n設定済み変数を確認するには:');
console.log('  railway variables');
