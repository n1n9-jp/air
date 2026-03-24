/**
 * GET /data/:type/:year/:month/:day
 */

import { isValidSampleType, parseDateParts, querySamples } from "../../../../../src/api-helpers.js";

export async function onRequestGet(context) {
    try {
        var p = context.params;
        var sampleType = p.type;
        var parts = parseDateParts(p.year, p.month, p.day);
        if (!isValidSampleType(sampleType) || isNaN(parts[0]) || isNaN(parts[1]) || isNaN(parts[2])) {
            return new Response("Bad Request", { status: 400 });
        }
        var constraints = { date: { current: false, parts: parts, zone: "+09:00" } };
        return await querySamples(context.env.DB, sampleType, constraints);
    } catch (error) {
        console.error(error);
        return new Response("Internal Server Error", { status: 500 });
    }
}
