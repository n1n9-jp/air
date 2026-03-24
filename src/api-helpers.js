/**
 * api-helpers - shared validation and query logic for Pages Functions.
 * Ported from api.js validation and query building.
 */

import { SAMPLE_COLUMNS } from "./db.js";
import { selectSamples } from "./db.js";
import { buildResponse } from "./response-builder.js";

var validSampleTypes = SAMPLE_COLUMNS;
var validOverlays = validSampleTypes.filter(function(s) {
    return s !== "date" && s !== "stationId" && s !== "wv" && s !== "wd";
});

/**
 * Validates whether a sample type is allowed.
 */
export function isValidSampleType(sampleType) {
    return sampleType === "wind" ||
        sampleType === "all" ||
        (sampleType !== "stationId" && sampleType !== "date" && validSampleTypes.indexOf(sampleType) !== -1);
}

/**
 * Parse and validate date parts. Returns array of parsed numbers, NaN for invalid parts.
 */
export function parseDateParts(year, month, day, hour) {
    function parseIntChecked(i, regex, from, to) {
        if (!regex.test(i)) return NaN;
        var result = parseFloat(i);
        if (result !== Math.floor(result) || result < from || to < result) return NaN;
        return result;
    }
    var parts = [parseIntChecked(year, /^\d{4}$/, 2000, 2100)];
    if (month !== undefined) parts.push(parseIntChecked(month, /^\d{1,2}$/, 1, 12));
    if (day !== undefined)   parts.push(parseIntChecked(day, /^\d{1,2}$/, 1, 31));
    if (hour !== undefined)  parts.push(parseIntChecked(hour, /^\d{1,2}$/, 0, 24));
    return parts;
}

/**
 * Execute a sample query and return a Response.
 */
export async function querySamples(db, sampleType, constraints) {
    if (sampleType !== "wind") {
        constraints.sampleType = sampleType;
    }

    var result = await selectSamples(db, constraints);
    var data = buildResponse(constraints.sampleType || null, result);

    if (data.notFound) {
        return new Response("Not Found", { status: 404 });
    }

    return new Response(data.jsonPayload, {
        headers: {
            "Content-Type": "application/json",
            "Last-Modified": data.lastModified.toUTCString()
        }
    });
}
