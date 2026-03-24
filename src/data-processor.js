/**
 * data-processor - transforms raw API JSON into database rows.
 * Ported from server.js data processing logic.
 */

import { toISOString, pad } from "./tool.js";

/**
 * Item ID to internal tag mapping for the Tokyo API.
 */
const ITEM_ID_TO_TAG = {
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
 * Wind direction master data (from V504Wd.json). Embedded as constant to avoid
 * fetching on every invocation.
 */
const WIND_DIRECTION_MAP = {
    "0":  { en: "-" },
    "1":  { en: "NNE" },
    "2":  { en: "NE" },
    "3":  { en: "ENE" },
    "4":  { en: "E" },
    "5":  { en: "ESE" },
    "6":  { en: "SE" },
    "7":  { en: "SSE" },
    "8":  { en: "S" },
    "9":  { en: "SSW" },
    "10": { en: "SW" },
    "11": { en: "WSW" },
    "12": { en: "W" },
    "13": { en: "WNW" },
    "14": { en: "NW" },
    "15": { en: "NNW" },
    "16": { en: "N" },
    "17": { en: "CALM" }
};

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
        case "CALM": return 360;
        case "-":    return null;
        default:     return null;
    }
}

function addTag(target, tag, value) {
    if (value === undefined || value === null || value === " " || value === "" || value === "-") {
        return target;
    }

    if (tag === "wd") {
        var entry = WIND_DIRECTION_MAP[value];
        if (entry) {
            var degrees = cardinalToDegrees(entry.en);
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
        case "temp": scale = 0.1; break;
        case "hum":  scale = 0.1; break;
        case "wv":   scale = 0.1; break;
        case "in":   scale = 0.01; break;
        case "no":   scale = 0.001; break;
        case "no2":  scale = 0.001; break;
        case "nox":  scale = 0.001; break;
        case "ox":   scale = 0.001; break;
        case "so2":  scale = 0.001; break;
        case "co":   scale = 0.1; break;
        case "ch4":  scale = 0.01; break;
        case "nmhc": scale = 0.01; break;
        case "spm":  break;
        case "pm25": break;
    }
    target[tag] = numValue * scale;
    return target;
}

/**
 * Converts a YYYYMMDDHH string to an ISO date string in JST.
 */
export function dateHourToISO(dateHour) {
    return toISOString({
        year:  dateHour.substring(0, 4),
        month: dateHour.substring(4, 6),
        day:   dateHour.substring(6, 8),
        hour:  dateHour.substring(8, 10),
        zone:  "+09:00"
    });
}

/**
 * Converts a Date object to YYYYMMDDHH string in JST.
 */
export function dateToDateHour(date) {
    var jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
    return pad(jst.getUTCFullYear(), 4) +
           pad(jst.getUTCMonth() + 1, 2) +
           pad(jst.getUTCDate(), 2) +
           pad(jst.getUTCHours(), 2);
}

/**
 * Processes hourly JSON data into row objects suitable for D1 upsert.
 *
 * @param {Object} data - hourly measurement data keyed by station code
 * @param {string} dateHour - YYYYMMDDHH string
 * @returns {Array|null} array of row objects, or null if insufficient data
 */
export function processHourlyData(data, dateHour) {
    if (!data || typeof data !== "object") {
        return null;
    }

    var date = dateHourToISO(dateHour);
    var windDataCount = 0;
    var rows = [];

    var stationCodes = Object.keys(data);
    for (var i = 0; i < stationCodes.length; i++) {
        var stationCode = stationCodes[i];
        var stationId = parseInt(stationCode, 10);
        var measurements = data[stationCode];

        var row = { date: date, stationId: stationId };

        var itemIds = Object.keys(ITEM_ID_TO_TAG);
        for (var j = 0; j < itemIds.length; j++) {
            var itemId = itemIds[j];
            var tag = ITEM_ID_TO_TAG[itemId];
            addTag(row, tag, measurements[itemId]);
        }

        if (row.hasOwnProperty("wd") && row.hasOwnProperty("wv")) {
            windDataCount++;
        }

        rows.push(row);
    }

    if (windDataCount < 5) {
        console.log("insufficient wind data: " + windDataCount);
        return null;
    }

    return rows;
}
