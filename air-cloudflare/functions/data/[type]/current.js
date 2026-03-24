/**
 * GET /data/:type/current
 */

import { isValidSampleType, querySamples } from "../../../src/api-helpers.js";

export async function onRequestGet(context) {
    try {
        var sampleType = context.params.type;
        if (!isValidSampleType(sampleType)) {
            return new Response("Bad Request", { status: 400 });
        }
        var constraints = { date: { current: true, parts: [], zone: "+09:00" } };
        return await querySamples(context.env.DB, sampleType, constraints);
    } catch (error) {
        console.error(error);
        return new Response("Internal Server Error", { status: 500 });
    }
}
