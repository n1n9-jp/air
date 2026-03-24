var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// ../src/tool.js
function pad(n, width) {
  var s = n.toString();
  while (s.length < width)
    s = "0" + s;
  return s;
}
__name(pad, "pad");
function coalesce(a, b) {
  return a !== void 0 && a !== null ? a : b;
}
__name(coalesce, "coalesce");
function format(pattern) {
  var args = Array.prototype.slice.call(arguments, 1);
  return pattern.replace(/{(\d+)}/g, function(match2, capture) {
    var index = capture * 1;
    return 0 <= index && index < args.length && args[index] !== void 0 ? args[index] : match2;
  });
}
__name(format, "format");
function dateToISO(date, zone) {
  return isFinite(date.getFullYear()) ? format(
    "{0}-{1}-{2} {3}:{4}:{5}{6}",
    date.getFullYear(),
    pad(date.getMonth() + 1, 2),
    pad(date.getDate(), 2),
    pad(date.getHours(), 2),
    pad(date.getMinutes(), 2),
    pad(date.getSeconds(), 2),
    zone
  ) : null;
}
__name(dateToISO, "dateToISO");
function toISOString(dateFields) {
  var date = new Date(
    coalesce(dateFields.year, 1901),
    coalesce(dateFields.month, 1) - 1,
    coalesce(dateFields.day, 1),
    coalesce(dateFields.hour, 0),
    coalesce(dateFields.minute, 0),
    coalesce(dateFields.second, 0)
  );
  return dateToISO(date, coalesce(dateFields.zone, "Z"));
}
__name(toISOString, "toISOString");
function withZone(isoString, zone) {
  zone = coalesce(zone, "Z");
  var adjust = zone === "Z" ? 0 : +zone.split(":")[0] * 60;
  var date = new Date(isoString);
  date.setMinutes(date.getMinutes() + adjust + date.getTimezoneOffset());
  return dateToISO(date, zone);
}
__name(withZone, "withZone");

// ../src/db.js
var SAMPLE_COLUMNS = [
  "date",
  "stationId",
  "temp",
  "hum",
  "wv",
  "wd",
  "in",
  "no",
  "no2",
  "nox",
  "ox",
  "so2",
  "co",
  "ch4",
  "nmhc",
  "spm",
  "pm25"
];
var OVERLAY_COLUMNS = SAMPLE_COLUMNS.filter(function(c) {
  return c !== "date" && c !== "stationId" && c !== "wv" && c !== "wd";
});
async function selectAllStations(db) {
  return db.prepare("SELECT * FROM stations ORDER BY id").all();
}
__name(selectAllStations, "selectAllStations");
async function selectSamples(db, constraints) {
  var sampleType = constraints.sampleType;
  var cols = ["s.date", "s.stationId", "t.longitude", "t.latitude", "s.wv", "s.wd"];
  if (sampleType) {
    if (sampleType === "all") {
      OVERLAY_COLUMNS.forEach(function(c) {
        cols.push('s."' + c + '"');
      });
    } else {
      cols.push('s."' + sampleType + '"');
    }
  }
  var sql = "SELECT " + cols.join(", ") + " FROM samples s INNER JOIN stations t ON s.stationId = t.id WHERE " + buildDateConstraint(constraints.date);
  sql += " ORDER BY s.date DESC, s.stationId";
  return db.prepare(sql).all();
}
__name(selectSamples, "selectSamples");
function buildDateConstraint(date) {
  var parts = date.parts;
  if (date.current) {
    if (parts.length === 0) {
      return "s.date = (SELECT MAX(date) FROM samples)";
    }
    var labels = ["year", "month", "day", "hour"];
    var offsets = parts.map(function(p, i) {
      return p + " " + labels[i];
    }).join(" ");
    return "s.date = datetime((SELECT MAX(date) FROM samples), '" + offsets + "')";
  }
  var iso = toISOString({
    year: parts[0],
    month: parts[1],
    day: parts[2],
    hour: parts[3],
    zone: date.zone
  });
  var labels = ["year", "month", "day", "hour"];
  var interval = labels[parts.length - 1];
  var endParts = {
    year: parts[0],
    month: parts[1] || 1,
    day: parts[2] || 1,
    hour: parts[3] !== void 0 ? parts[3] : 0,
    zone: date.zone
  };
  switch (interval) {
    case "year":
      endParts.year += 1;
      break;
    case "month":
      endParts.month += 1;
      break;
    case "day":
      endParts.day += 1;
      break;
    case "hour":
      endParts.hour += 1;
      break;
  }
  var endIso = toISOString(endParts);
  return "s.date >= '" + iso + "' AND s.date < '" + endIso + "'";
}
__name(buildDateConstraint, "buildDateConstraint");

// ../src/response-builder.js
function asNullOrNumber(v) {
  return v !== null && v !== void 0 && isFinite(v) ? +v : null;
}
__name(asNullOrNumber, "asNullOrNumber");
function dateMax(a, b) {
  return a < b ? b : a;
}
__name(dateMax, "dateMax");
function buildResponse(sampleType, result) {
  var rows = result.results;
  var keys = [];
  if (sampleType) {
    keys = sampleType === "all" ? OVERLAY_COLUMNS : [sampleType];
  }
  var buckets = {};
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var wd = asNullOrNumber(row.wd);
    var wv = asNullOrNumber(row.wv);
    var data = keys.map(function(key) {
      return { overlay: key, value: asNullOrNumber(row[key]) };
    });
    if (row.stationId == 208) {
      wd = wv = null;
    }
    if (!(isFinite(wd) && isFinite(wv)) && data.filter(function(d) {
      return isFinite(d.value);
    }).length === 0) {
      continue;
    }
    var sample = {
      stationId: row.stationId.toString(),
      coordinates: [asNullOrNumber(row.longitude), asNullOrNumber(row.latitude)],
      wind: [wd, wv]
    };
    data.forEach(function(datum) {
      sample[datum.overlay] = datum.value;
    });
    var date = row.date;
    if (!buckets[date]) {
      buckets[date] = [];
    }
    buckets[date].push(sample);
  }
  var resultArray = [];
  var mostRecent = /* @__PURE__ */ new Date("1901-01-01 00:00:00Z");
  Object.keys(buckets).forEach(function(date2) {
    resultArray.push({ date: withZone(date2, "+09:00"), samples: buckets[date2] });
    mostRecent = dateMax(mostRecent, new Date(date2));
  });
  return {
    lastModified: mostRecent,
    jsonPayload: JSON.stringify(resultArray),
    notFound: resultArray.length === 0
  };
}
__name(buildResponse, "buildResponse");

// ../src/api-helpers.js
var validSampleTypes = SAMPLE_COLUMNS;
var validOverlays = validSampleTypes.filter(function(s) {
  return s !== "date" && s !== "stationId" && s !== "wv" && s !== "wd";
});
function isValidSampleType(sampleType) {
  return sampleType === "wind" || sampleType === "all" || sampleType !== "stationId" && sampleType !== "date" && validSampleTypes.indexOf(sampleType) !== -1;
}
__name(isValidSampleType, "isValidSampleType");
function parseDateParts(year, month, day, hour) {
  function parseIntChecked(i, regex, from, to) {
    if (!regex.test(i))
      return NaN;
    var result = parseFloat(i);
    if (result !== Math.floor(result) || result < from || to < result)
      return NaN;
    return result;
  }
  __name(parseIntChecked, "parseIntChecked");
  var parts = [parseIntChecked(year, /^\d{4}$/, 2e3, 2100)];
  if (month !== void 0)
    parts.push(parseIntChecked(month, /^\d{1,2}$/, 1, 12));
  if (day !== void 0)
    parts.push(parseIntChecked(day, /^\d{1,2}$/, 1, 31));
  if (hour !== void 0)
    parts.push(parseIntChecked(hour, /^\d{1,2}$/, 0, 24));
  return parts;
}
__name(parseDateParts, "parseDateParts");
async function querySamples(db, sampleType, constraints) {
  if (sampleType !== "wind") {
    constraints.sampleType = sampleType;
  }
  var result = await selectSamples(db, constraints);
  var data = buildResponse(constraints.sampleType || null, result);
  if (data.notFound) {
    return new Response("Not Found", { status: 404 });
  }
  return new Response(data.jsonPayload, {
    headers: {
      "Content-Type": "application/json",
      "Last-Modified": data.lastModified.toUTCString()
    }
  });
}
__name(querySamples, "querySamples");

// data/[type]/[year]/[month]/[day]/[hour].js
async function onRequestGet(context) {
  try {
    var p = context.params;
    var sampleType = p.type;
    var parts = parseDateParts(p.year, p.month, p.day, p.hour);
    if (!isValidSampleType(sampleType) || isNaN(parts[0]) || isNaN(parts[1]) || isNaN(parts[2]) || isNaN(parts[3])) {
      return new Response("Bad Request", { status: 400 });
    }
    var constraints = { date: { current: false, parts, zone: "+09:00" } };
    return await querySamples(context.env.DB, sampleType, constraints);
  } catch (error) {
    console.error(error);
    return new Response("Internal Server Error", { status: 500 });
  }
}
__name(onRequestGet, "onRequestGet");

// map/[type]/[year]/[month]/[day]/[hour].js
async function onRequestGet2(context) {
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
__name(onRequestGet2, "onRequestGet");

// data/[type]/[year]/[month]/[day].js
async function onRequestGet3(context) {
  try {
    var p = context.params;
    var sampleType = p.type;
    var parts = parseDateParts(p.year, p.month, p.day);
    if (!isValidSampleType(sampleType) || isNaN(parts[0]) || isNaN(parts[1]) || isNaN(parts[2])) {
      return new Response("Bad Request", { status: 400 });
    }
    var constraints = { date: { current: false, parts, zone: "+09:00" } };
    return await querySamples(context.env.DB, sampleType, constraints);
  } catch (error) {
    console.error(error);
    return new Response("Internal Server Error", { status: 500 });
  }
}
__name(onRequestGet3, "onRequestGet");

// data/[type]/[year]/[month].js
async function onRequestGet4(context) {
  try {
    var sampleType = context.params.type;
    var parts = parseDateParts(context.params.year, context.params.month);
    if (!isValidSampleType(sampleType) || isNaN(parts[0]) || isNaN(parts[1])) {
      return new Response("Bad Request", { status: 400 });
    }
    var constraints = { date: { current: false, parts, zone: "+09:00" } };
    return await querySamples(context.env.DB, sampleType, constraints);
  } catch (error) {
    console.error(error);
    return new Response("Internal Server Error", { status: 500 });
  }
}
__name(onRequestGet4, "onRequestGet");

// data/[type]/current.js
async function onRequestGet5(context) {
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
__name(onRequestGet5, "onRequestGet");

// map/[type]/current.js
async function onRequestGet6(context) {
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
__name(onRequestGet6, "onRequestGet");

// data/stations.js
async function onRequestGet7(context) {
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
__name(onRequestGet7, "onRequestGet");

// _middleware.js
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
async function onRequest(context) {
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
__name(onRequest, "onRequest");

// ../.wrangler/tmp/pages-lyarKZ/functionsRoutes-0.5557623330050037.mjs
var routes = [
  {
    routePath: "/data/:type/:year/:month/:day/:hour",
    mountPath: "/data/:type/:year/:month/:day",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet]
  },
  {
    routePath: "/map/:type/:year/:month/:day/:hour",
    mountPath: "/map/:type/:year/:month/:day",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet2]
  },
  {
    routePath: "/data/:type/:year/:month/:day",
    mountPath: "/data/:type/:year/:month",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet3]
  },
  {
    routePath: "/data/:type/:year/:month",
    mountPath: "/data/:type/:year",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet4]
  },
  {
    routePath: "/data/:type/current",
    mountPath: "/data/:type",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet5]
  },
  {
    routePath: "/map/:type/current",
    mountPath: "/map/:type",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet6]
  },
  {
    routePath: "/data/stations",
    mountPath: "/data",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet7]
  },
  {
    routePath: "/",
    mountPath: "/",
    method: "",
    middlewares: [onRequest],
    modules: []
  }
];

// ../node_modules/path-to-regexp/dist.es2015/index.js
function lexer(str) {
  var tokens = [];
  var i = 0;
  while (i < str.length) {
    var char = str[i];
    if (char === "*" || char === "+" || char === "?") {
      tokens.push({ type: "MODIFIER", index: i, value: str[i++] });
      continue;
    }
    if (char === "\\") {
      tokens.push({ type: "ESCAPED_CHAR", index: i++, value: str[i++] });
      continue;
    }
    if (char === "{") {
      tokens.push({ type: "OPEN", index: i, value: str[i++] });
      continue;
    }
    if (char === "}") {
      tokens.push({ type: "CLOSE", index: i, value: str[i++] });
      continue;
    }
    if (char === ":") {
      var name = "";
      var j = i + 1;
      while (j < str.length) {
        var code = str.charCodeAt(j);
        if (
          // `0-9`
          code >= 48 && code <= 57 || // `A-Z`
          code >= 65 && code <= 90 || // `a-z`
          code >= 97 && code <= 122 || // `_`
          code === 95
        ) {
          name += str[j++];
          continue;
        }
        break;
      }
      if (!name)
        throw new TypeError("Missing parameter name at ".concat(i));
      tokens.push({ type: "NAME", index: i, value: name });
      i = j;
      continue;
    }
    if (char === "(") {
      var count = 1;
      var pattern = "";
      var j = i + 1;
      if (str[j] === "?") {
        throw new TypeError('Pattern cannot start with "?" at '.concat(j));
      }
      while (j < str.length) {
        if (str[j] === "\\") {
          pattern += str[j++] + str[j++];
          continue;
        }
        if (str[j] === ")") {
          count--;
          if (count === 0) {
            j++;
            break;
          }
        } else if (str[j] === "(") {
          count++;
          if (str[j + 1] !== "?") {
            throw new TypeError("Capturing groups are not allowed at ".concat(j));
          }
        }
        pattern += str[j++];
      }
      if (count)
        throw new TypeError("Unbalanced pattern at ".concat(i));
      if (!pattern)
        throw new TypeError("Missing pattern at ".concat(i));
      tokens.push({ type: "PATTERN", index: i, value: pattern });
      i = j;
      continue;
    }
    tokens.push({ type: "CHAR", index: i, value: str[i++] });
  }
  tokens.push({ type: "END", index: i, value: "" });
  return tokens;
}
__name(lexer, "lexer");
function parse(str, options) {
  if (options === void 0) {
    options = {};
  }
  var tokens = lexer(str);
  var _a = options.prefixes, prefixes = _a === void 0 ? "./" : _a, _b = options.delimiter, delimiter = _b === void 0 ? "/#?" : _b;
  var result = [];
  var key = 0;
  var i = 0;
  var path = "";
  var tryConsume = /* @__PURE__ */ __name(function(type) {
    if (i < tokens.length && tokens[i].type === type)
      return tokens[i++].value;
  }, "tryConsume");
  var mustConsume = /* @__PURE__ */ __name(function(type) {
    var value2 = tryConsume(type);
    if (value2 !== void 0)
      return value2;
    var _a2 = tokens[i], nextType = _a2.type, index = _a2.index;
    throw new TypeError("Unexpected ".concat(nextType, " at ").concat(index, ", expected ").concat(type));
  }, "mustConsume");
  var consumeText = /* @__PURE__ */ __name(function() {
    var result2 = "";
    var value2;
    while (value2 = tryConsume("CHAR") || tryConsume("ESCAPED_CHAR")) {
      result2 += value2;
    }
    return result2;
  }, "consumeText");
  var isSafe = /* @__PURE__ */ __name(function(value2) {
    for (var _i = 0, delimiter_1 = delimiter; _i < delimiter_1.length; _i++) {
      var char2 = delimiter_1[_i];
      if (value2.indexOf(char2) > -1)
        return true;
    }
    return false;
  }, "isSafe");
  var safePattern = /* @__PURE__ */ __name(function(prefix2) {
    var prev = result[result.length - 1];
    var prevText = prefix2 || (prev && typeof prev === "string" ? prev : "");
    if (prev && !prevText) {
      throw new TypeError('Must have text between two parameters, missing text after "'.concat(prev.name, '"'));
    }
    if (!prevText || isSafe(prevText))
      return "[^".concat(escapeString(delimiter), "]+?");
    return "(?:(?!".concat(escapeString(prevText), ")[^").concat(escapeString(delimiter), "])+?");
  }, "safePattern");
  while (i < tokens.length) {
    var char = tryConsume("CHAR");
    var name = tryConsume("NAME");
    var pattern = tryConsume("PATTERN");
    if (name || pattern) {
      var prefix = char || "";
      if (prefixes.indexOf(prefix) === -1) {
        path += prefix;
        prefix = "";
      }
      if (path) {
        result.push(path);
        path = "";
      }
      result.push({
        name: name || key++,
        prefix,
        suffix: "",
        pattern: pattern || safePattern(prefix),
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    var value = char || tryConsume("ESCAPED_CHAR");
    if (value) {
      path += value;
      continue;
    }
    if (path) {
      result.push(path);
      path = "";
    }
    var open = tryConsume("OPEN");
    if (open) {
      var prefix = consumeText();
      var name_1 = tryConsume("NAME") || "";
      var pattern_1 = tryConsume("PATTERN") || "";
      var suffix = consumeText();
      mustConsume("CLOSE");
      result.push({
        name: name_1 || (pattern_1 ? key++ : ""),
        pattern: name_1 && !pattern_1 ? safePattern(prefix) : pattern_1,
        prefix,
        suffix,
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    mustConsume("END");
  }
  return result;
}
__name(parse, "parse");
function match(str, options) {
  var keys = [];
  var re = pathToRegexp(str, keys, options);
  return regexpToFunction(re, keys, options);
}
__name(match, "match");
function regexpToFunction(re, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.decode, decode = _a === void 0 ? function(x) {
    return x;
  } : _a;
  return function(pathname) {
    var m = re.exec(pathname);
    if (!m)
      return false;
    var path = m[0], index = m.index;
    var params = /* @__PURE__ */ Object.create(null);
    var _loop_1 = /* @__PURE__ */ __name(function(i2) {
      if (m[i2] === void 0)
        return "continue";
      var key = keys[i2 - 1];
      if (key.modifier === "*" || key.modifier === "+") {
        params[key.name] = m[i2].split(key.prefix + key.suffix).map(function(value) {
          return decode(value, key);
        });
      } else {
        params[key.name] = decode(m[i2], key);
      }
    }, "_loop_1");
    for (var i = 1; i < m.length; i++) {
      _loop_1(i);
    }
    return { path, index, params };
  };
}
__name(regexpToFunction, "regexpToFunction");
function escapeString(str) {
  return str.replace(/([.+*?=^!:${}()[\]|/\\])/g, "\\$1");
}
__name(escapeString, "escapeString");
function flags(options) {
  return options && options.sensitive ? "" : "i";
}
__name(flags, "flags");
function regexpToRegexp(path, keys) {
  if (!keys)
    return path;
  var groupsRegex = /\((?:\?<(.*?)>)?(?!\?)/g;
  var index = 0;
  var execResult = groupsRegex.exec(path.source);
  while (execResult) {
    keys.push({
      // Use parenthesized substring match if available, index otherwise
      name: execResult[1] || index++,
      prefix: "",
      suffix: "",
      modifier: "",
      pattern: ""
    });
    execResult = groupsRegex.exec(path.source);
  }
  return path;
}
__name(regexpToRegexp, "regexpToRegexp");
function arrayToRegexp(paths, keys, options) {
  var parts = paths.map(function(path) {
    return pathToRegexp(path, keys, options).source;
  });
  return new RegExp("(?:".concat(parts.join("|"), ")"), flags(options));
}
__name(arrayToRegexp, "arrayToRegexp");
function stringToRegexp(path, keys, options) {
  return tokensToRegexp(parse(path, options), keys, options);
}
__name(stringToRegexp, "stringToRegexp");
function tokensToRegexp(tokens, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.strict, strict = _a === void 0 ? false : _a, _b = options.start, start = _b === void 0 ? true : _b, _c = options.end, end = _c === void 0 ? true : _c, _d = options.encode, encode = _d === void 0 ? function(x) {
    return x;
  } : _d, _e = options.delimiter, delimiter = _e === void 0 ? "/#?" : _e, _f = options.endsWith, endsWith = _f === void 0 ? "" : _f;
  var endsWithRe = "[".concat(escapeString(endsWith), "]|$");
  var delimiterRe = "[".concat(escapeString(delimiter), "]");
  var route = start ? "^" : "";
  for (var _i = 0, tokens_1 = tokens; _i < tokens_1.length; _i++) {
    var token = tokens_1[_i];
    if (typeof token === "string") {
      route += escapeString(encode(token));
    } else {
      var prefix = escapeString(encode(token.prefix));
      var suffix = escapeString(encode(token.suffix));
      if (token.pattern) {
        if (keys)
          keys.push(token);
        if (prefix || suffix) {
          if (token.modifier === "+" || token.modifier === "*") {
            var mod = token.modifier === "*" ? "?" : "";
            route += "(?:".concat(prefix, "((?:").concat(token.pattern, ")(?:").concat(suffix).concat(prefix, "(?:").concat(token.pattern, "))*)").concat(suffix, ")").concat(mod);
          } else {
            route += "(?:".concat(prefix, "(").concat(token.pattern, ")").concat(suffix, ")").concat(token.modifier);
          }
        } else {
          if (token.modifier === "+" || token.modifier === "*") {
            throw new TypeError('Can not repeat "'.concat(token.name, '" without a prefix and suffix'));
          }
          route += "(".concat(token.pattern, ")").concat(token.modifier);
        }
      } else {
        route += "(?:".concat(prefix).concat(suffix, ")").concat(token.modifier);
      }
    }
  }
  if (end) {
    if (!strict)
      route += "".concat(delimiterRe, "?");
    route += !options.endsWith ? "$" : "(?=".concat(endsWithRe, ")");
  } else {
    var endToken = tokens[tokens.length - 1];
    var isEndDelimited = typeof endToken === "string" ? delimiterRe.indexOf(endToken[endToken.length - 1]) > -1 : endToken === void 0;
    if (!strict) {
      route += "(?:".concat(delimiterRe, "(?=").concat(endsWithRe, "))?");
    }
    if (!isEndDelimited) {
      route += "(?=".concat(delimiterRe, "|").concat(endsWithRe, ")");
    }
  }
  return new RegExp(route, flags(options));
}
__name(tokensToRegexp, "tokensToRegexp");
function pathToRegexp(path, keys, options) {
  if (path instanceof RegExp)
    return regexpToRegexp(path, keys);
  if (Array.isArray(path))
    return arrayToRegexp(path, keys, options);
  return stringToRegexp(path, keys, options);
}
__name(pathToRegexp, "pathToRegexp");

// ../node_modules/wrangler/templates/pages-template-worker.ts
var escapeRegex = /[.+?^${}()|[\]\\]/g;
function* executeRequest(request) {
  const requestPath = new URL(request.url).pathname;
  for (const route of [...routes].reverse()) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult) {
      for (const handler of route.middlewares.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: mountMatchResult.path
        };
      }
    }
  }
  for (const route of routes) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: true
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult && route.modules.length) {
      for (const handler of route.modules.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: matchResult.path
        };
      }
      break;
    }
  }
}
__name(executeRequest, "executeRequest");
var pages_template_worker_default = {
  async fetch(originalRequest, env, workerContext) {
    let request = originalRequest;
    const handlerIterator = executeRequest(request);
    let data = {};
    let isFailOpen = false;
    const next = /* @__PURE__ */ __name(async (input, init) => {
      if (input !== void 0) {
        let url = input;
        if (typeof input === "string") {
          url = new URL(input, request.url).toString();
        }
        request = new Request(url, init);
      }
      const result = handlerIterator.next();
      if (result.done === false) {
        const { handler, params, path } = result.value;
        const context = {
          request: new Request(request.clone()),
          functionPath: path,
          next,
          params,
          get data() {
            return data;
          },
          set data(value) {
            if (typeof value !== "object" || value === null) {
              throw new Error("context.data must be an object");
            }
            data = value;
          },
          env,
          waitUntil: workerContext.waitUntil.bind(workerContext),
          passThroughOnException: () => {
            isFailOpen = true;
          }
        };
        const response = await handler(context);
        if (!(response instanceof Response)) {
          throw new Error("Your Pages function should return a Response");
        }
        return cloneResponse(response);
      } else if ("ASSETS") {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      } else {
        const response = await fetch(request);
        return cloneResponse(response);
      }
    }, "next");
    try {
      return await next();
    } catch (error) {
      if (isFailOpen) {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      }
      throw error;
    }
  }
};
var cloneResponse = /* @__PURE__ */ __name((response) => (
  // https://fetch.spec.whatwg.org/#null-body-status
  new Response(
    [101, 204, 205, 304].includes(response.status) ? null : response.body,
    response
  )
), "cloneResponse");
export {
  pages_template_worker_default as default
};
