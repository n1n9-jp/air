/**
 * GET /data/stations - returns all station data as JSON.
 */

import { selectAllStations } from "../../src/db.js";

export async function onRequestGet(context) {
    try {
        var result = await selectAllStations(context.env.DB);
        return new Response(JSON.stringify(result.results), {
            headers: { "Content-Type": "application/json" }
        });
    } catch (error) {
        console.error(error);
        return new Response("Internal Server Error", { status: 500 });
    }
}
