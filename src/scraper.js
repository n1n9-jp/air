/**
 * scraper - fetches air quality data from the Tokyo Metropolitan Government's JSON API.
 * Uses the Workers-native fetch() API.
 */

const BASE_URL = "https://www.taiki.kankyo.metro.tokyo.lg.jp/taikikankyo/data";

/**
 * Fetches and parses a JSON file from the given URL.
 */
export async function fetchJSON(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error("HTTP " + response.status + " from " + url);
    }
    return response.json();
}

/**
 * Fetches the property configuration (available time range).
 */
export async function fetchProperty() {
    return fetchJSON(BASE_URL + "/V505Property.json");
}

/**
 * Fetches the wind direction master data.
 */
export async function fetchWindDirections() {
    return fetchJSON(BASE_URL + "/V504Wd.json");
}

/**
 * Fetches hourly measurement data for the specified dateHour (YYYYMMDDHH).
 */
export async function fetchHourlyData(dateHour) {
    var ym = dateHour.substring(0, 6);
    return fetchJSON(BASE_URL + "/hour/" + ym + "/" + dateHour + ".json");
}
