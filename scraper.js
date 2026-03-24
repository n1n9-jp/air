/**
 * scraper - fetches air quality data from the Tokyo Metropolitan Government's JSON API.
 *
 * The new data source (taiki.kankyo.metro.tokyo.lg.jp) provides data as JSON files
 * instead of the old Shift_JIS HTML pages, so HTML parsing is no longer needed.
 */

"use strict";

var when = require("when");
var https = require("https");
var tool = require("./tool");
var log = tool.log();

var BASE_URL = "https://www.taiki.kankyo.metro.tokyo.lg.jp/taikikankyo/data";

/**
 * Performs an HTTPS GET and parses the JSON response. The result is a promise for the parsed object.
 *
 * @param {string} url the URL to fetch
 * @returns {promise} a promise for the parsed JSON object
 */
exports.fetchJSON = function(url) {
    var d = when.defer();
    log.info("get: " + url);
    https.get(url, function(response) {
        var chunks = [];
        response.on("data", function(chunk) {
            chunks.push(chunk);
        });
        response.on("end", function() {
            log.info("got: " + url);
            try {
                var text = Buffer.concat(chunks).toString("utf-8");
                var parsed = JSON.parse(text);
                log.info("done: " + url);
                d.resolve(parsed);
            } catch (e) {
                d.reject(new Error("Failed to parse JSON from " + url + ": " + e.message));
            }
        });
    }).on("error", function(error) {
        d.reject(error);
    });
    return d.promise;
};

/**
 * Fetches the property configuration (available time range, etc.)
 *
 * @returns {promise} a promise for the V505Property object
 */
exports.fetchProperty = function() {
    return exports.fetchJSON(BASE_URL + "/V505Property.json");
};

/**
 * Fetches the station master data.
 *
 * @returns {promise} a promise for the V501Station object
 */
exports.fetchStations = function() {
    return exports.fetchJSON(BASE_URL + "/V501Station.json");
};

/**
 * Fetches the wind direction master data.
 *
 * @returns {promise} a promise for the V504Wd object
 */
exports.fetchWindDirections = function() {
    return exports.fetchJSON(BASE_URL + "/V504Wd.json");
};

/**
 * Fetches hourly measurement data for the specified date/hour.
 *
 * @param {string} dateHour in YYYYMMDDHH format
 * @returns {promise} a promise for the hourly data object
 */
exports.fetchHourlyData = function(dateHour) {
    var ym = dateHour.substring(0, 6);
    var url = BASE_URL + "/hour/" + ym + "/" + dateHour + ".json";
    return exports.fetchJSON(url);
};
