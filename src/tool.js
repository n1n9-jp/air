/**
 * tool - utility functions (Workers-compatible, no Node.js dependencies)
 */

/**
 * Returns the string representation of a number padded with leading zeros.
 */
export function pad(n, width) {
    var s = n.toString();
    while (s.length < width) s = "0" + s;
    return s;
}

/**
 * Return the first non-null, non-undefined argument, otherwise the second.
 */
export function coalesce(a, b) {
    return a !== undefined && a !== null ? a : b;
}

/**
 * Returns a formatted string with {0}, {1}, ... replaced by arguments.
 */
export function format(pattern) {
    var args = Array.prototype.slice.call(arguments, 1);
    return pattern.replace(/{(\d+)}/g, function(match, capture) {
        var index = capture * 1;
        return 0 <= index && index < args.length && args[index] !== undefined ? args[index] : match;
    });
}

/**
 * Returns the date as an ISO string: "yyyy-MM-dd hh:mm:ss±xx:yy"
 */
function dateToISO(date, zone) {
    return isFinite(date.getFullYear()) ?
        format("{0}-{1}-{2} {3}:{4}:{5}{6}",
            date.getFullYear(),
            pad(date.getMonth() + 1, 2),
            pad(date.getDate(), 2),
            pad(date.getHours(), 2),
            pad(date.getMinutes(), 2),
            pad(date.getSeconds(), 2),
            zone) :
        null;
}

/**
 * Converts date fields to an ISO 8601 formatted string.
 */
export function toISOString(dateFields) {
    var date = new Date(
        coalesce(dateFields.year, 1901),
        coalesce(dateFields.month, 1) - 1,
        coalesce(dateFields.day, 1),
        coalesce(dateFields.hour, 0),
        coalesce(dateFields.minute, 0),
        coalesce(dateFields.second, 0));
    return dateToISO(date, coalesce(dateFields.zone, "Z"));
}

/**
 * Converts the date represented by the specified ISO string to a different time zone.
 */
export function withZone(isoString, zone) {
    zone = coalesce(zone, "Z");
    var adjust = zone === "Z" ? 0 : +(zone.split(":")[0]) * 60;
    var date = new Date(isoString);
    date.setMinutes(date.getMinutes() + adjust + date.getTimezoneOffset());
    return dateToISO(date, zone);
}
