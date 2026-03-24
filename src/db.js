/**
 * db - D1 (SQLite) database operations for air quality data.
 */

import { toISOString } from "./tool.js";

const SAMPLE_COLUMNS = [
    "date", "stationId", "temp", "hum", "wv", "wd", "in", "no",
    "no2", "nox", "ox", "so2", "co", "ch4", "nmhc", "spm", "pm25"
];

const OVERLAY_COLUMNS = SAMPLE_COLUMNS.filter(function(c) {
    return c !== "date" && c !== "stationId" && c !== "wv" && c !== "wd";
});

export { SAMPLE_COLUMNS, OVERLAY_COLUMNS };

/**
 * Batch upsert sample rows into D1.
 */
export async function batchUpsertSamples(db, rows) {
    var stmts = [];
    for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        stmts.push(
            db.prepare(
                'INSERT OR REPLACE INTO samples (date, stationId, temp, hum, wv, wd, "in", "no", no2, nox, ox, so2, co, ch4, nmhc, spm, pm25) ' +
                'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
            ).bind(
                row.date,
                row.stationId,
                row.temp !== undefined ? row.temp : null,
                row.hum  !== undefined ? row.hum  : null,
                row.wv   !== undefined ? row.wv   : null,
                row.wd   !== undefined ? row.wd   : null,
                row.in   !== undefined ? row.in   : null,
                row.no   !== undefined ? row.no   : null,
                row.no2  !== undefined ? row.no2  : null,
                row.nox  !== undefined ? row.nox  : null,
                row.ox   !== undefined ? row.ox   : null,
                row.so2  !== undefined ? row.so2  : null,
                row.co   !== undefined ? row.co   : null,
                row.ch4  !== undefined ? row.ch4  : null,
                row.nmhc !== undefined ? row.nmhc : null,
                row.spm  !== undefined ? row.spm  : null,
                row.pm25 !== undefined ? row.pm25 : null
            )
        );
    }
    return db.batch(stmts);
}

/**
 * Select all stations.
 */
export async function selectAllStations(db) {
    return db.prepare("SELECT * FROM stations ORDER BY id").all();
}

/**
 * Build and execute a samples query based on constraints.
 *
 * @param {D1Database} db
 * @param {Object} constraints - { date: { current, parts, zone }, sampleType }
 * @returns {Object} D1 result with .results array
 */
export async function selectSamples(db, constraints) {
    var sampleType = constraints.sampleType;

    // Determine columns to select
    var cols = ["s.date", "s.stationId", "t.longitude", "t.latitude", "s.wv", "s.wd"];
    if (sampleType) {
        if (sampleType === "all") {
            OVERLAY_COLUMNS.forEach(function(c) {
                cols.push('s."' + c + '"');
            });
        } else {
            cols.push('s."' + sampleType + '"');
        }
    }

    var sql = "SELECT " + cols.join(", ") +
              " FROM samples s INNER JOIN stations t ON s.stationId = t.id" +
              " WHERE " + buildDateConstraint(constraints.date);

    sql += " ORDER BY s.date DESC, s.stationId";

    return db.prepare(sql).all();
}

/**
 * Build a SQL WHERE clause for date constraints.
 */
function buildDateConstraint(date) {
    var parts = date.parts;

    if (date.current) {
        if (parts.length === 0) {
            return "s.date = (SELECT MAX(date) FROM samples)";
        }
        // Current with offset - not commonly used, but supported
        var labels = ["year", "month", "day", "hour"];
        var offsets = parts.map(function(p, i) {
            return p + " " + labels[i];
        }).join(" ");
        return "s.date = datetime((SELECT MAX(date) FROM samples), '" + offsets + "')";
    }

    // Date range query
    var iso = toISOString({
        year:  parts[0],
        month: parts[1],
        day:   parts[2],
        hour:  parts[3],
        zone:  date.zone
    });

    var labels = ["year", "month", "day", "hour"];
    var interval = labels[parts.length - 1];

    // For SQLite, we use string comparison since dates are stored as ISO strings
    // Build the end date by incrementing the appropriate field
    var endParts = {
        year:  parts[0],
        month: parts[1] || 1,
        day:   parts[2] || 1,
        hour:  parts[3] !== undefined ? parts[3] : 0,
        zone:  date.zone
    };

    switch (interval) {
        case "year":  endParts.year += 1; break;
        case "month": endParts.month += 1; break;
        case "day":   endParts.day += 1; break;
        case "hour":  endParts.hour += 1; break;
    }

    var endIso = toISOString(endParts);

    return "s.date >= '" + iso + "' AND s.date < '" + endIso + "'";
}
