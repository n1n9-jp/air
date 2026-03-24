air - データソース
===

地図上に描画されるデータは、以下の3つのソースから構成されています。

## 1. 地理データ（東京の地図）

| 項目 | 内容 |
|------|------|
| ファイル | `public/data/tokyo-topo.json` |
| 元データ | 国土交通省 国土数値情報（約80MBのXML） |
| 形式 | TopoJSON（約300KB） |
| 変換ツール | `ksj/ksj.js` |

国土交通省の国土数値情報ダウンロードサービスから取得した東京都の行政区域データを、
`ksj/ksj.js` でTopoJSON形式に変換しています。クライアント側で [D3.js](http://d3js.org/)
によりSVGとして描画されます。

## 2. 大気質・風向風速データ（リアルタイム）

| 項目 | 内容 |
|------|------|
| データ元 | ~~東京都環境局 `www.kankyo.metro.tokyo.jp`~~ （現在は接続不可） |
| スクレイパー | `scraper.js` / `server.js` |
| エンコード | Shift_JIS → UTF-8 に変換 |
| 更新頻度 | 1時間ごとにポーリング |

> **注意（2026年3月確認）：** 旧データソース `www.kankyo.metro.tokyo.jp` は現在接続できません。
> 東京都の大気環境データは以下の新サイトに移行しています：
>
> https://www.taiki.kankyo.metro.tokyo.lg.jp/taikikankyo/realtime/index.html
>
> 新サイトでも同等のデータ（大気汚染物質、風向・風速、気温・湿度・日射量）が1時間ごとに提供されていますが、
> HTML構造やエンコードが異なるため、スクレイパー（`scraper.js` / `server.js`）の改修が必要です。

東京都環境局のサイト（`p160.cgi`）からShift_JISエンコードのHTMLをスクレイピングし、
パースしてPostgreSQLに保存しています。

**取得データ一覧：**

| カテゴリ | 項目 |
|----------|------|
| 大気汚染物質 | SO2, NO, NO2, NOx, Ox, CO, SPM, PM2.5, CH4, NMHC |
| 風 | 風向(wd), 風速(wv) |
| 気象 | 気温(temp), 湿度(hum), 日射量(in) |

**APIエンドポイント：**

| エンドポイント | 説明 |
|----------------|------|
| `/data/wind/current` | 現在の風データ |
| `/data/wind/{year}/{month}/{day}/{hour}` | 過去の風データ |
| `/data/{sampleType}/current` | 現在の各種測定データ |
| `/data/{sampleType}/{year}/{month}/{day}/{hour}` | 過去の各種測定データ |
| `/data/stations` | 全測定局の情報 |

## 3. 測定局データ

| 項目 | 内容 |
|------|------|
| ファイル | `station-data.json` |
| 局数 | 約50か所 |
| 内容 | 測定局ID、名称、住所、緯度・経度 |

## データフロー

```
東京都環境局サイト → スクレイパー(scraper.js) → PostgreSQL → Express.js API → クライアント(air.js)
                                                                                    ↓
国土交通省XML → TopoJSON変換(ksj.js) → tokyo-topo.json ──────────────────────→ D3.js で地図描画
                                                                                    ↓
                                                                         IDW/TPS補間 → Canvas上にアニメーション描画
```

## 主要ファイル一覧

| ファイル | 説明 |
|----------|------|
| `server.js` | メインサーバー、スクレイパー制御、定期更新 |
| `scraper.js` | HTMLパース・データ抽出ユーティリティ |
| `api.js` | Express.jsルーティング・APIエンドポイント |
| `schema.js` | PostgreSQLテーブル定義 |
| `station-data.json` | 測定局の位置・メタデータ |
| `ksj/ksj.js` | 国土数値情報XML → TopoJSON変換ツール |
| `public/js/air.js` | クライアント側の可視化・データ読込・アニメーション |
| `public/js/mvi.js` | 多変量補間アルゴリズム（IDW, TPS） |
| `public/data/tokyo-topo.json` | 東京の地理境界データ（TopoJSON） |
