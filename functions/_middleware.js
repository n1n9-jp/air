/**
 * Pages Functions middleware - Cache-Control headers.
 */

var SECOND = 1;
var MINUTE = 60 * SECOND;
var HOUR = 60 * MINUTE;
var DAY = 24 * HOUR;
var DEFAULT = 30 * MINUTE;

var rules = [
    [/data\/.*\/current/, 1 * MINUTE],
    [/js\/air\.js/, DEFAULT],
    [/js\/mvi\.js/, DEFAULT],
    [/js\/.*\.js/, 5 * DAY],
    [/tokyo-topo\.json/, 5 * DAY],
    [/mplus-.*\.ttf/, 30 * DAY],
    [/\.png|\.ico/, 30 * DAY]
];

export async function onRequest(context) {
    var response = await context.next();
    var url = new URL(context.request.url);

    var maxAge = DEFAULT;
    for (var i = 0; i < rules.length; i++) {
        if (rules[i][0].test(url.pathname)) {
            maxAge = rules[i][1];
            break;
        }
    }

    var newResponse = new Response(response.body, response);
    newResponse.headers.set("Cache-Control", "public, max-age=" + maxAge);
    return newResponse;
}
