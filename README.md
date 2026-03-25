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
npm run deploy          # Pages + Functions
npm run deploy:cron     # Cron Worker（毎時データ取得）
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

## アニメーション調整

風の流れアニメーションの見た目は `public/js/air.js` の `createSettings()` 関数内で調整できます。

```javascript
particleCount: Math.round(bounds.height / 0.5),  // パーティクル数
maxParticleAge: 60,   // パーティクルが消えるまでのフレーム数
velocityScale: ...,   // 風速ベクトル → ピクセル移動量の変換係数
frameRate: 40,        // フレーム間隔（ms）
fadeFillStyle: "rgba(0, 0, 0, 0.97)",  // 軌跡の残像の消え方
```

| パラメータ | 大きくすると | 小さくすると |
|---|---|---|
| `particleCount` | 線が密になり激しく見える | 線がまばらで穏やかに見える |
| `maxParticleAge` | 軌跡が長く滑らかに見える | 軌跡が短く点滅的に見える |
| `velocityScale` | 粒子の移動速度が速くなる | 粒子の移動速度が遅くなる |
| `frameRate` | 描画が遅くなる（カクカク） | 描画が速くなる（滑らか） |
| `fadeFillStyle` の alpha | 残像がすぐ消える（0.99等） | 残像が長く残る（0.95等） |

## カラースキーム

オーバーレイの配色は気象庁の「気象情報の配色に関する設定指針」およびD3 v7のカラースキームを採用しています。
定義は `public/js/air.js` の `COLOR_SCHEMES` オブジェクトで変更できます。

| データ種別 | カラースキーム | 視覚的な表現 |
|---|---|---|
| temp（気温） | 気象庁 気温配色（表3-1） | 紺(寒)→青→白→黄→橙→赤→赤紫(暑) |
| hum（湿度） | `d3.interpolateBlues` | 薄青→濃青 |
| wv（風速） | `d3.interpolatePurples` | 薄紫→濃紫 |
| in（日射量） | `d3.interpolateYlOrBr` | 黄→橙→茶 |
| 汚染物質全般 | 気象庁 危険度配色（表2-1） | 白→水色→青→黄→橙→赤→赤紫 |

汚染物質全般: NO, NO2, NOx, Ox, SO2, CO, CH4, NMHC, SPM, PM2.5

参考:
- 気象庁配色指針: https://www.jma.go.jp/jma/kishou/info/colorguide/
- D3 v7カラースキーム: https://d3js.org/d3-scale-chromatic

## データソースについて

東京都環境局のサイトが内部的に利用しているJSON APIからデータを取得しています。
詳細は親ディレクトリの `DATASOURCE.md` を参照してください。
