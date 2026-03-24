-- D1 (SQLite) schema for air-tokyo

-- 測定局マスタ
CREATE TABLE IF NOT EXISTS stations (
    id INTEGER NOT NULL PRIMARY KEY,
    name TEXT,
    address TEXT,
    latitude REAL,
    longitude REAL
);

-- 測定データ
CREATE TABLE IF NOT EXISTS samples (
    date TEXT NOT NULL,
    stationId INTEGER NOT NULL,
    temp REAL,
    hum REAL,
    wv REAL,
    wd REAL,
    "in" REAL,
    "no" REAL,
    no2 REAL,
    nox REAL,
    ox REAL,
    so2 REAL,
    co REAL,
    ch4 REAL,
    nmhc REAL,
    spm REAL,
    pm25 REAL,
    PRIMARY KEY (date, stationId)
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_samples_date ON samples(date);
