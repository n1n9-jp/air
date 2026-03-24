/**
 * server - the main "air" server application.
 *
 * This module starts the database, scraper, and api components. It processes data fetched from the
 * Tokyo Metropolitan Government's JSON API and sets up periodic polling.
 */

"use strict";

console.log("============================================================");
console.log(new Date().toISOString() + " - Starting");

var util = require("util");
var _ = require("underscore");
var when = require("when");
var db = require("./db");
var scraper = require("./scraper");
var tool = require("./tool");
var schema = require("./schema");
var api = require("./api");
var stationsData = require("./station-data");

var log = tool.log();

var stationNames = {};

/**
 * Item ID to internal tag mapping for the new JSON API.
 * See V502Item.json for the full list.
 */
var ITEM_ID_TO_TAG = {
    "001": "so2",
    "002": "ox",
    "003": "no",
    "004": "no2",
    "005": "nox",
    "006": "spm",
    "007": "co",
    "008": "ch4",
    "009": "nmhc",
    "011": "wd",
    "012": "wv",
    "013": "temp",
    "014": "hum",
    "015": "in",
    "016": "pm25"
};

/**
 * Wind direction code mapping from the new API (V504Wd.json uses numeric keys 0-17).
 * The "en" field values map to cardinal directions used by cardinalToDegrees().
 */
var windDirectionMap = null;  // loaded at startup from V504Wd.json

function cardinalToDegrees(s) {
    switch (s) {
        case "N":    return 0;
        case "NNE":  return 22.5;
        case "NE":   return 45;
        case "ENE":  return 67.5;
        case "E":    return 90;
        case "ESE":  return 112.5;
        case "SE":   return 135;
        case "SSE":  return 157.5;
        case "S":    return 180;
        case "SSW":  return 202.5;
        case "SW":   return 225;
        case "WSW":  return 247.5;
        case "W":    return 270;
        case "WNW":  return 292.5;
        case "NW":   return 315;
        case "NNW":  return 337.5;
        case "CALM": return 360;  // calm; map to 360 to distinguish from 0 (N) and null (no sample)
        case "-":    return null;
        default: return null;
    }
}

function addTag(target, tag, value) {
    if (value === undefined || value === null || value === " " || value === "" || value === "-") {
        return target;
    }

    // For wind direction, convert the numeric code to cardinal direction then to degrees
    if (tag === "wd") {
        if (windDirectionMap && windDirectionMap[value]) {
            var cardinal = windDirectionMap[value].en;
            var degrees = cardinalToDegrees(cardinal);
            if (degrees !== null) {
                target[tag] = degrees;
            }
        }
        return target;
    }

    var numValue = parseFloat(value);
    if (isNaN(numValue)) {
        return target;
    }

    var scale = 1;
    switch (tag) {
        case "temp": scale = 0.1; break;    // 0.1 deg C -> deg C
        case "hum":  scale = 0.1; break;    // 0.1% -> 1%
        case "wv":   scale = 0.1; break;    // 0.1 m/s -> 1 m/s
        case "in":   scale = 0.01; break;   // 0.01 MJ/m2 -> MJ/m2
        case "no":   scale = 0.001; break;  // ppb -> ppm
        case "no2":  scale = 0.001; break;  // ppb -> ppm
        case "nox":  scale = 0.001; break;  // ppb -> ppm
        case "ox":   scale = 0.001; break;  // ppb -> ppm
        case "so2":  scale = 0.001; break;  // ppb -> ppm
        case "co":   scale = 0.1; break;    // 0.1 ppm -> ppm
        case "ch4":  scale = 0.01; break;   // pphmC -> ppm
        case "nmhc": scale = 0.01; break;   // pphmC -> ppm
        case "spm":  break;                 // μg/m3
        case "pm25": break;                 // μg/m3
    }
    target[tag] = numValue * scale;
    return target;
}

/**
 * Converts a dateHour string (YYYYMMDDHH) to an ISO date string in JST.
 */
function dateHourToISO(dateHour) {
    return tool.toISOString({
        year:  dateHour.substring(0, 4),
        month: dateHour.substring(4, 6),
        day:   dateHour.substring(6, 8),
        hour:  dateHour.substring(8, 10),
        zone:  "+09:00"
    });
}

/**
 * Converts a Date object to a YYYYMMDDHH string in JST.
 */
function dateToDateHour(date) {
    // Convert to JST (UTC+9)
    var jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
    return tool.pad(jst.getUTCFullYear(), 4) +
           tool.pad(jst.getUTCMonth() + 1, 2) +
           tool.pad(jst.getUTCDate(), 2) +
           tool.pad(jst.getUTCHours(), 2);
}

/**
 * Processes hourly JSON data from the new API and returns database upsert statements.
 *
 * @param {Object} data the hourly measurement data keyed by station code
 * @param {string} dateHour the YYYYMMDDHH string for this data
 * @returns {Array|null} array of upsert statements, or null if insufficient data
 */
function processHourlyData(data, dateHour) {
    log.info("Processing hourly data for " + dateHour + "...");

    if (!data || typeof data !== "object") {
        log.error("no data found for " + dateHour);
        return null;
    }

    var date = dateHourToISO(dateHour);
    var counts = {windData: 0};
    var statements = [];

    _.keys(data).forEach(function(stationCode) {
        var stationId = parseInt(stationCode, 10);
        var stationMeasurements = data[stationCode];

        var item = { stationId: stationId, date: date };

        _.keys(ITEM_ID_TO_TAG).forEach(function(itemId) {
            var tag = ITEM_ID_TO_TAG[itemId];
            var value = stationMeasurements[itemId];
            addTag(item, tag, value);
        });

        if (item.hasOwnProperty("wd") && item.hasOwnProperty("wv")) {
            counts.windData += 1;
        }

        stationNames[stationCode] = stationId;
        statements.push(db.upsert(schema.samples, item));
    });

    if (counts.windData < 5) {
        log.error("insufficient wind data found: " + counts.windData);
        return null;
    }

    return statements;
}

function start() {
    log.info("Preparing tables...");
    return persist([db.createTable(schema.stations), db.createTable(schema.samples)]);
}

function persist(statements) {
    if (!statements) {
        return when.resolve(null);
    }
    log.info("Persisting...");
    return db.executeAll(statements);
}

/**
 * Fetches and processes data for a specific dateHour.
 */
function doFetchHour(dateHour) {
    return scraper.fetchHourlyData(dateHour)
        .then(function(data) {
            return processHourlyData(data, dateHour);
        })
        .then(persist);
}

/**
 * Fetches and processes the current (latest) hour's data.
 */
function doFetchCurrent() {
    return scraper.fetchProperty().then(function(property) {
        var endTime = property.end_time;  // e.g., "2026032418"
        log.info("Latest available data: " + endTime);
        return doFetchHour(endTime);
    });
}

/**
 * Polls for updates, returning a promise for a boolean which is true if new data was found.
 */
function pollForNewData() {
    return scraper.fetchProperty().then(function(property) {
        var endTime = property.end_time;
        log.info("Polling: latest available = " + endTime);
        return doFetchHour(endTime).then(function(result) {
            if (result) {
                var rowsInserted = 0;
                result.forEach(function(r) {
                    rowsInserted += r.rowCount;
                });
                log.info("results of poll: rowsInserted = " + rowsInserted);
                var foundNewData = rowsInserted >= 60;
                if (foundNewData) {
                    log.info("resetting query memos");
                    api.resetQueryMemos();
                }
                return foundNewData;
            }
            return false;
        });
    });
}

function doStationDetails() {
    log.info("Preparing station details...");
    var statements = [];
    _.keys(stationNames).forEach(function(code) {
        statements.push(db.upsert(schema.stations, {id: stationNames[code], name: code}));
    });
    stationsData.forEach(function(station) {
        var row = {
            id: station[0],
            name: station[1],
            address: station[2],
            latitude: station[3],
            longitude: station[4]
        };
        statements.push(db.upsert(schema.stations, row));
    });
    return persist(statements);
}

function doHistorical(hours) {
    log.info("Starting Historical fetch...");
    var now = new Date();
    var dates = [];
    for (var i = 1; i <= hours; i++) {
        var pastDate = new Date(now.getTime() - (i * 60 * 60 * 1000));
        dates.push(dateToDateHour(pastDate));
    }

    function wait(x) {
        var d = when.defer();
        setTimeout(function() { d.resolve(x); }, 1000);
        return d.promise;
    }

    return function doAnotherDate() {
        if (dates.length > 0) {
            var dateHour = dates.shift();
            log.info(tool.format("Processing {0}... (remaining: {1})", dateHour, dates.length));
            return doFetchHour(dateHour).then(wait).then(doAnotherDate);
        }
        else {
            log.info("Finished Historical fetch");
        }
    }();
}

/**
 * Look for new air data every hour.
 */
function pollForUpdates() {
    var ONE_SECOND = 1000;
    var ONE_MINUTE = 60 * ONE_SECOND;
    var ONE_HOUR = 60 * ONE_MINUTE;

    function exponentialBackoff(t) {
        return Math.min(Math.pow(2, t < 0 ? -(t + 1) : t), 8) * ONE_MINUTE;
    }

    tool.setFlexInterval(pollForNewData, ONE_MINUTE, ONE_HOUR, exponentialBackoff, -1);
}

// Load wind direction master data, then start the server
scraper.fetchWindDirections().then(function(wdData) {
    windDirectionMap = wdData;
    log.info("Wind direction map loaded");

    return start()
        .then(doFetchCurrent)
        .then(doStationDetails)
        .then(pollForUpdates)
        .then(doHistorical.bind(undefined, 0/*168 = 7 days of historical data available*/))
        .then(null, function(e) { log.error(e.stack); });
}).then(null, function(e) { log.error(e.stack); });
