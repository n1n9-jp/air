/**
 * cron-handler - Cloudflare Worker that fetches air quality data on a schedule.
 * Triggered by Cron Triggers (every hour).
 */

import { fetchProperty, fetchHourlyData, fetchStations } from "./scraper.js";
import { processHourlyData, dateToDateHour } from "./data-processor.js";
import { batchUpsertSamples, syncStations } from "./db.js";

/**
 * Fetch and store data for a single dateHour.
 * Returns the number of rows upserted, or 0 on failure.
 */
async function fetchAndStore(db, dateHour) {
    try {
        console.log("Fetching data for " + dateHour + "...");
        var data = await fetchHourlyData(dateHour);
        var result = processHourlyData(data, dateHour);
        if (!result) {
            console.log("No valid data for " + dateHour);
            return 0;
        }
        if (result.windDataCount < 5) {
            console.log("Low wind data for " + dateHour + ": " + result.windDataCount + " stations");
        }
        await batchUpsertSamples(db, result.rows);
        console.log("Stored " + result.rows.length + " rows for " + dateHour);
        return result.rows.length;
    } catch (e) {
        console.error("Error fetching " + dateHour + ": " + e.message);
        return 0;
    }
}

export default {
    async scheduled(event, env, ctx) {
        var db = env.DB;

        // 0. Sync station master data
        try {
            var apiStations = await fetchStations();
            await syncStations(db, apiStations);
        } catch (e) {
            console.error("Station sync failed: " + e.message);
        }

        // 1. Get the latest available dateHour from the Tokyo API
        var property = await fetchProperty();
        var endTime = property.end_time;
        console.log("Latest available data: " + endTime);

        // 2. Fetch the latest hour
        var count = await fetchAndStore(db, endTime);

        // 3. Also fetch the previous 2 hours to fill any gaps
        var now = new Date();
        for (var i = 1; i <= 2; i++) {
            var pastDate = new Date(now.getTime() - (i * 60 * 60 * 1000));
            var pastDateHour = dateToDateHour(pastDate);
            await fetchAndStore(db, pastDateHour);
        }

        console.log("Cron completed. Latest: " + endTime + ", rows: " + count);
    },

    /**
     * Also handle HTTP requests for manual triggering and health checks.
     */
    async fetch(request, env, ctx) {
        var url = new URL(request.url);

        if (url.pathname === "/trigger") {
            // Manual trigger - same logic as scheduled
            await this.scheduled({}, env, ctx);
            return new Response("OK - data fetched", { status: 200 });
        }

        if (url.pathname === "/backfill") {
            // Backfill historical data (up to 168 hours = 7 days)
            var hours = parseInt(url.searchParams.get("hours") || "168");
            if (isNaN(hours) || hours < 1) hours = 168;
            if (hours > 168) hours = 168;

            var db = env.DB;
            var now = new Date();
            var total = 0;

            for (var i = 0; i < hours; i++) {
                var pastDate = new Date(now.getTime() - (i * 60 * 60 * 1000));
                var dateHour = dateToDateHour(pastDate);
                var count = await fetchAndStore(db, dateHour);
                total += count;
                // Small delay to avoid overwhelming the Tokyo API
                if (i % 10 === 9) {
                    await new Promise(function(resolve) { setTimeout(resolve, 1000); });
                }
            }

            return new Response("Backfill complete: " + total + " total rows over " + hours + " hours", { status: 200 });
        }

        return new Response("air-tokyo-cron worker. Use /trigger or /backfill?hours=168", { status: 200 });
    }
};
