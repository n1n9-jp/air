air-tokyo (Cloudflare版)
===

東京都の大気質データを可視化するプロジェクト「air」のCloudflare Workers + D1 + Pages版です。

## アーキテクチャ

```
[定期取得]  Cron Trigger(毎時) → Worker → 東京都JSON API → D1(SQLite)に保存
[クライアント]  Pages(静的) → Pages Functions(API) → D1 → ブラウザで描画
```

| コンポーネント | 役割 |
|---|---|
| **Cloudflare Pages** | 静的フロントエンド配信（`public/`） |
| **Pages Functions** | APIエンドポイント（`functions/`） |
| **Cloudflare D1** | SQLiteデータベース（測定局・測定データ） |
| **Cron Worker** | 毎時データ取得・D1保存（`src/cron-handler.js`） |

## 前提条件

- [Cloudflareアカウント](https://dash.cloudflare.com/sign-up)
- Node.js 18以上
- Wrangler CLI（`npm install` でインストールされます）

## セットアップ

### 1. 依存関係のインストール

```bash
npm install
```

### 2. Cloudflareにログイン

```bash
npx wrangler login
```

### 3. D1データベースの作成

```bash
npx wrangler d1 create air-tokyo-db
```

出力された `database_id` を以下の2ファイルに設定してください：
- `wrangler.toml` の `database_id`
- `wrangler-cron.toml` の `database_id`

### 4. マイグレーション実行

```bash
# テーブル作成
npx wrangler d1 execute air-tokyo-db --remote --file=migrations/0001_initial.sql

# 測定局マスタデータ投入（82局）
npx wrangler d1 execute air-tokyo-db --remote --file=migrations/0002_seed_stations.sql
```

### 5. デプロイ

```bash
# Pages（静的サイト + API Functions）
npx wrangler pages deploy public/

# Cron Worker（毎時データ取得）
npx wrangler deploy --config wrangler-cron.toml
```

### 6. 過去データのバックフィル

Cron Workerがデプロイされたら、過去7日分のデータを一括取得できます：

```bash
curl "https://air-tokyo-cron.tokyo-air.workers.dev/backfill?hours=168"
```

## ローカル開発

```bash
# ローカルD1にマイグレーション適用（初回のみ）
# .wrangler/state/v3/d1/ 以下のSQLiteファイルに直接適用するか、
# devサーバー起動後にAPIからデータを投入してください

# devサーバー起動
npx wrangler pages dev public/ --d1 DB=air-tokyo-db

# ブラウザでアクセス
open http://localhost:8788
```

## APIエンドポイント

| パス | 説明 |
|------|------|
| `GET /data/stations` | 全測定局情報 |
| `GET /data/wind/current` | 最新の風データ |
| `GET /data/:type/current` | 最新の各種測定データ |
| `GET /data/:type/:year/:month/:day/:hour` | 指定日時の測定データ |
| `GET /map/:type/current` | 指定タイプの可視化ページ |

`:type` には `wind`, `temp`, `hum`, `pm25`, `ox`, `no2`, `so2`, `co`, `spm`, `ch4`, `nmhc`, `all` が使用可能です。

## プロジェクト構成

```
air-cloudflare/
├── wrangler.toml              # Pages設定 + D1バインディング
├── wrangler-cron.toml         # Cron Worker設定
├── package.json
├── migrations/
│   ├── 0001_initial.sql       # テーブル作成
│   └── 0002_seed_stations.sql # 測定局マスタデータ
├── src/
│   ├── tool.js                # ユーティリティ
│   ├── scraper.js             # 東京都JSON API取得
│   ├── data-processor.js      # データ変換・単位変換
│   ├── db.js                  # D1操作
│   ├── response-builder.js    # DB結果→クライアントJSON変換
│   ├── api-helpers.js         # バリデーション・クエリヘルパー
│   └── cron-handler.js        # 定期取得 + backfill
├── functions/
│   ├── _middleware.js          # Cache-Control
│   ├── data/
│   │   ├── stations.js        # GET /data/stations
│   │   └── [type]/            # 動的ルーティング
│   └── map/
│       └── [type]/            # 地図表示ルート
└── public/                    # 静的フロントエンド
```

## データソースについて

東京都環境局のサイトが内部的に利用しているJSON APIからデータを取得しています。
詳細は親ディレクトリの `DATASOURCE.md` を参照してください。
