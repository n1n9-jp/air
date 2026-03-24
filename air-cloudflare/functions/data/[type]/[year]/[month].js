/**
 * GET /data/:type/:year/:month
 */

import { isValidSampleType, parseDateParts, querySamples } from "../../../../src/api-helpers.js";

export async function onRequestGet(context) {
    try {
        var sampleType = context.params.type;
        var parts = parseDateParts(context.params.year, context.params.month);
        if (!isValidSampleType(sampleType) || isNaN(parts[0]) || isNaN(parts[1])) {
            return new Response("Bad Request", { status: 400 });
        }
        var constraints = { date: { current: false, parts: parts, zone: "+09:00" } };
        return await querySamples(context.env.DB, sampleType, constraints);
    } catch (error) {
        console.error(error);
        return new Response("Internal Server Error", { status: 500 });
    }
}
