/**
 * response-builder - transforms D1 query results into the JSON format expected by the client.
 * Ported from api.js buildResponse().
 */

import { withZone } from "./tool.js";
import { OVERLAY_COLUMNS } from "./db.js";

function asNullOrNumber(v) {
    return v !== null && v !== undefined && isFinite(v) ? +v : null;
}

function dateMax(a, b) {
    return a < b ? b : a;
}

/**
 * Builds the JSON response for sample data.
 *
 * @param {string|null} sampleType - the requested sample type
 * @param {Object} result - D1 query result with .results array
 * @returns {Object} { lastModified, jsonPayload, notFound }
 */
export function buildResponse(sampleType, result) {
    var rows = result.results;

    var keys = [];
    if (sampleType) {
        keys = sampleType === "all" ? OVERLAY_COLUMNS : [sampleType];
    }

    var buckets = {};

    for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        var wd = asNullOrNumber(row.wd);
        var wv = asNullOrNumber(row.wv);

        var data = keys.map(function(key) {
            return { overlay: key, value: asNullOrNumber(row[key]) };
        });

        if (row.stationId == 208) {
            wd = wv = null;  // this station appears to have bogus wind readings
        }

        // skip rows that have no data
        if (!(isFinite(wd) && isFinite(wv)) && data.filter(function(d) { return isFinite(d.value); }).length === 0) {
            continue;
        }

        var sample = {
            stationId: row.stationId.toString(),
            coordinates: [asNullOrNumber(row.longitude), asNullOrNumber(row.latitude)],
            wind: [wd, wv]
        };
        data.forEach(function(datum) {
            sample[datum.overlay] = datum.value;
        });

        // D1 stores full ISO strings (e.g., "2026-03-24 19:00:00+09:00").
        // Original PostgreSQL CAST(date AS TEXT) returned "2026-03-24 19:00:00+09" (no :00 in tz),
        // so the old code added ":00". For D1, the date is already complete.
        var date = row.date;
        if (!buckets[date]) {
            buckets[date] = [];
        }
        buckets[date].push(sample);
    }

    var resultArray = [];
    var mostRecent = new Date("1901-01-01 00:00:00Z");
    Object.keys(buckets).forEach(function(date) {
        resultArray.push({ date: withZone(date, "+09:00"), samples: buckets[date] });
        mostRecent = dateMax(mostRecent, new Date(date));
    });

    return {
        lastModified: mostRecent,
        jsonPayload: JSON.stringify(resultArray),
        notFound: resultArray.length === 0
    };
}
