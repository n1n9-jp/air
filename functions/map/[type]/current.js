/**
 * GET /map/:type/current - serves modified index.html with data attributes.
 */

import { isValidSampleType } from "../../../src/api-helpers.js";

export async function onRequestGet(context) {
    try {
        var sampleType = context.params.type;
        if (!isValidSampleType(sampleType)) {
            return new Response("Bad Request", { status: 400 });
        }

        var assetResponse = await context.env.ASSETS.fetch(new URL("/index.html", context.request.url));
        var text = await assetResponse.text();

        text = text.replace(/data-type="wind"/, 'data-type="' + sampleType + '"');
        text = text.replace(/data-samples="\/data\/wind\/current"/, 'data-samples="/data/' + sampleType + '/current"');

        return new Response(text, {
            headers: { "Content-Type": "text/html; charset=utf-8" }
        });
    } catch (error) {
        console.error(error);
        return new Response("Internal Server Error", { status: 500 });
    }
}
