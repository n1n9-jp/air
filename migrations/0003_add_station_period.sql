-- 測定局マスタに開始年月・終了年月カラムを追加
ALTER TABLE stations ADD COLUMN sd INTEGER;
ALTER TABLE stations ADD COLUMN ed INTEGER;
