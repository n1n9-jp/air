

コマンド	用途
npm run dev	ローカル開発サーバー起動
npm run deploy	Pages + Functions デプロイ
npm run deploy:cron	Cron Worker デプロイ
npm run db:create	D1データベース作成
npm run db:migrate	マイグレーション実行
npm run db:seed	測定局データ投入

フロントエンド（public/）は元々ビルド不要な静的ファイルで、Functionsはwrangler pages deploy時にWranglerが自動コンパイルします。


[[d1_databases]]
binding = "DB"
database_name = "air-tokyo-db"
database_id = "ff69e164-b957-4cef-8c64-7bd65bec3795"


Deployed air-tokyo-cron triggers (203.58 sec)
  https://air-tokyo-cron.tokyo-air.workers.dev
  schedule: 0 * * * *
Current Version ID: d074e4fc-ee58-4fa2-82f7-599a2812b16f


curl "https://air-tokyo-cron.tokyo-air.workers.dev/backfill?hours=168"


