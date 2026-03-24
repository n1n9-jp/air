/**
 * GET /map/:type/:year/:month/:day/:hour - serves modified index.html with data attributes.
 */

import { isValidSampleType, parseDateParts } from "../../../../../../src/api-helpers.js";
import { toISOString } from "../../../../../../src/tool.js";

export async function onRequestGet(context) {
    try {
        var p = context.params;
        var sampleType = p.type;
        var parts = parseDateParts(p.year, p.month, p.day, p.hour);
        if (!isValidSampleType(sampleType) || isNaN(parts[0]) || isNaN(parts[1]) || isNaN(parts[2]) || isNaN(parts[3])) {
            return new Response("Bad Request", { status: 400 });
        }

        var date = toISOString({ year: parts[0], month: parts[1], day: parts[2], hour: parts[3] });
        var samplesPath = "/data/" + sampleType + "/" + parts.join("/");

        var assetResponse = await context.env.ASSETS.fetch(new URL("/index.html", context.request.url));
        var text = await assetResponse.text();

        text = text.replace(/data-type="wind"/, 'data-type="' + sampleType + '"');
        text = text.replace(/data-samples="\/data\/wind\/current"/, 'data-samples="' + samplesPath + '"');
        text = text.replace(/data-date=""/, 'data-date="' + date.substr(0, date.length - 1) + '"');

        return new Response(text, {
            headers: { "Content-Type": "text/html; charset=utf-8" }
        });
    } catch (error) {
        console.error(error);
        return new Response("Internal Server Error", { status: 500 });
    }
}
