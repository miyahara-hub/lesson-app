# プロジェクト引き継ぎメモ

> 新しいアプリを作る時は最初にこのファイルを読むこと

---

## プロジェクト1：シフト管理アプリ

| 項目 | 内容 |
|------|------|
| フォルダ | `/Users/miyaharakoji/shift_manager` |
| 公開方法 | Firebase Hosting（`firebase deploy`） |

### 次回修正時

```bash
cd /Users/miyaharakoji/shift_manager
# ここで claude を起動
```

---

## プロジェクト2：レッスン管理アプリ

| 項目 | 内容 |
|------|------|
| フォルダ | `/Users/miyaharakoji/lesson-app` |
| URL | https://lesson-app-production.up.railway.app |
| サーバー | Railway（Node.js / Express） |
| データベース | Firebase Firestore |
| Firebaseプロジェクト | `lesson-manager-ed12a` |
| GitHubリポジトリ | `miyahara-hub/lesson-app` |
| パスワード管理 | `.env` ファイル |
| スタッフ | 22名・5店舗対応済み |

### 公開方法（デプロイ）

```bash
git add .
git commit -m "変更内容"
git push   # → Railway が自動デプロイ
```

⚠️ `firebase deploy` は**不要**（Railway を使用）

### ローカル起動

```bash
cd /Users/miyaharakoji/lesson-app
node server.js
# → http://localhost:3000
```

### 構成メモ

- Firebase Cloud Functions は有料プランが必要なため**不使用**
- MongoDB → Firestore へ移行済み（JSON フォールバックも残してある）
- `firebase-key.json` はローカルのみ。Railway には環境変数で設定済み
- 管理者パスワード認証あり（全体管理者 / 店舗管理者の 2 種類）

---

## パスワード管理（重要）

- `.env` ファイル（ローカル用）と Railway の環境変数（本番用）の**両方を同じパスワードに設定**する必要がある
- Railway の環境変数を変更すると**自動でデプロイ**される
- 確認コマンド：`railway variables`

---

## 次回 Claude への注意事項

1. **レッスンアプリは `firebase deploy` 不要** — Railway を使用
2. **修正後の反映** — `git add .` → `git commit` → `git push` で自動デプロイ
3. **新しいアプリを作る時** — 最初にこの MEMO.md を読む

---

_最終更新: 2026-05-08（パスワード管理セクション追加）_
