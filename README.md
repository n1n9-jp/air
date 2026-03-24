# README

## データソース更新 & Cloudflareデプロイ版

| コマンド | 用途 |
|---|---|
| `npm run dev` | ローカル開発サーバー起動 |
| `npm run deploy` | Pages + Functions デプロイ |
| `npm run deploy:cron` | Cron Worker デプロイ |
| `npm run db:create` | D1データベース作成 |
| `npm run db:migrate` | マイグレーション実行 |
| `npm run db:seed` | 測定局データ投入 |

フロントエンド（public/）は元々ビルド不要な静的ファイルで、Functionsはwrangler pages deploy時にWranglerが自動コンパイルします。

