# Lesson Manager — Salon Scheduling App

美容師向けレッスン管理ウェブアプリ

## セットアップ

```bash
cd lesson-app
npm install
npm start
```

ブラウザで `http://localhost:3000` を開く。

## 起動方法

```bash
# 開発時（自動リスタート）
npx nodemon server.js

# 通常起動
node server.js
```

## 機能

- **ログイン** — 名前タップで即時ログイン（22名）
- **講師メニュー** — レッスン公開・担当レッスン管理
- **参加者メニュー** — レッスン申し込み・一覧表示
- **合同レッスン調整** — パターンA（空き日集計）/ パターンB（候補投票）
- **管理画面** — レッスン・集計・スタッフ・種類の4タブ
- **Google カレンダー連携** — ワンタップでカレンダーに追加

## ユーザー種別

| 役割 | 権限 |
|------|------|
| 講師 | レッスン公開・参加申し込み |
| 臨時講師 | 代行担当・参加申し込み |
| 参加者 | レッスン申し込み |
| 店舗管理者 | 自店舗のスタッフ・レッスン管理 |
| 全体管理者 | 全店舗の管理（田中 美咲） |

## データ構造

データは `data/` フォルダの JSON ファイルに保存されます。

- `stores.json` — 店舗情報
- `users.json` — スタッフ情報（22名）
- `lesson-types.json` — レッスン種類
- `lessons.json` — 公開レッスン・参加者
- `adjustments.json` — 合同レッスン調整

将来的なDBへの移行は、`server.js` の `readJSON`/`writeJSON` ヘルパーを差し替えるだけで対応可能です。

## Firebase Firestore 連携

### セットアップ手順

1. [Firebase Console](https://console.firebase.google.com/) でプロジェクトを作成
2. Firestore Database → 「データベースの作成」→ 本番モード
3. プロジェクト設定 → サービスアカウント → 「新しい秘密鍵の生成」で JSON をダウンロード
4. 環境変数を設定（方法A推奨）：

**方法A — 個別の環境変数（Railway に設定しやすい）**
```
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----\n"
```

**方法B — サービスアカウント JSON 文字列**
```
FIREBASE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"...",...}
```

### 動作モード

| 状態 | 挙動 |
|------|------|
| Firebase 認証情報あり・接続成功 | Firestore を使用。空コレクションに `data/*.json` から自動シード |
| Firebase 認証情報なし | `data/*.json` をそのまま使用（ローカル開発向け） |
| Firebase 認証情報あり・接続失敗 | 自動で `data/*.json` にフォールバック |

### コレクション構成（Firestore）

```
stores/        — 店舗情報
users/         — スタッフ（storeId, role でフィルタ）
lessonTypes/   — レッスン種類
lessons/       — 公開レッスン（storeId + date でクエリ）
adjustments/   — 合同レッスン調整（storeId + status でクエリ）
```

## Railway デプロイ（Railway CLI）

GitHub 連携なしで、ローカルから直接 Railway にデプロイします。

### 1. Railway CLI インストール（初回のみ）

```bash
npm install -g @railway/cli
```

### 2. ログイン

```bash
railway login
```

ブラウザが開くので Railway アカウントで認証します。

### 3. プロジェクト作成・紐付け

```bash
railway init
```

対話式プロンプトで新規プロジェクトを作成します（プロジェクト名は任意）。

### 4. Firebase 認証情報を Railway に設定

付属のスクリプトが `firebase-key.json` から自動で設定します：

```bash
node scripts/set-railway-env.js
```

続けて管理者パスワードを設定します：

```bash
railway variables set ADMIN_PASSWORD_SUPER="パスワード"
railway variables set ADMIN_PASSWORD_STORE="パスワード"
```

### 5. デプロイ

```bash
railway up
```

デプロイ完了後、Railway CLI が URL を表示します（例: `https://lesson-app-xxxx.up.railway.app`）。

---

### 以降のデプロイ（コード変更時）

```bash
railway up
```

### 環境変数の確認・変更

```bash
# 設定済み変数を一覧表示
railway variables

# 変数を追加・更新
railway variables set KEY="VALUE"
```

### 必須環境変数まとめ

| 変数名 | 設定方法 |
|--------|---------|
| `FIREBASE_PROJECT_ID` | `set-railway-env.js` が自動設定 |
| `FIREBASE_CLIENT_EMAIL` | `set-railway-env.js` が自動設定 |
| `FIREBASE_PRIVATE_KEY` | `set-railway-env.js` が自動設定 |
| `ADMIN_PASSWORD_SUPER` | 手動で `railway variables set` |
| `ADMIN_PASSWORD_STORE` | 手動で `railway variables set` |

`PORT` は Railway が自動設定するため不要です。

- **Hosting** — `public/` の静的ファイルを配信
- **Cloud Functions** — `/api/**` のリクエストを Express アプリで処理
- **Firestore** — Firebase Functions では Application Default Credentials が自動適用されるため `FIREBASE_*` 環境変数は不要

## 複数店舗対応

現在は1店舗（メインサロン）ですが、管理画面でいつでも店舗を追加できます。
スタッフは1店舗に所属し、レッスンは店舗ごとに管理されます。
