// Paste into the Google Sheet's bound Apps Script project.
// Set COACH_PASSWORD in Project Settings > Script properties, then run setup().
var TAB_NAME = 'Setters';
var HEADERS = ['Key', 'League ID', 'Team', 'Match ID', 'Setters', 'Backup setters',
  'Setting system', 'Set overrides', 'Choices JSON', 'Revision', 'Updated at',
  'Updated by', 'Last request ID'];

function setup() {
  var properties = PropertiesService.getScriptProperties();
  if (!properties.getProperty('COACH_PASSWORD')) {
    throw new Error('Add the COACH_PASSWORD script property before running setup.');
  }
  var book = SpreadsheetApp.getActiveSpreadsheet();
  if (!book) throw new Error('Open Apps Script through Extensions in your Google Sheet.');
  properties.setProperty('SPREADSHEET_ID', book.getId());
  var sheet = book.getSheetByName(TAB_NAME) || book.insertSheet(TAB_NAME);
  if (!sheet.getLastRow()) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold').setBackground('#fed7aa');
    sheet.setColumnWidths(1, HEADERS.length, 145);
    sheet.setColumnWidth(3, 190);
    sheet.setColumnWidth(9, 300);
  }
  assertHeaders_(sheet);
  console.log('Ready. Deploy as a web app: Execute as Me; access Anyone.');
}

function problem_(code, message) {
  var error = new Error(message);
  error.publicCode = code;
  throw error;
}

function sheet_() {
  var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) problem_('SETUP', 'The owner needs to run setup() in Apps Script.');
  var sheet = SpreadsheetApp.openById(id).getSheetByName(TAB_NAME);
  if (!sheet) problem_('SETUP', 'The Setters tab is missing. Run setup().');
  assertHeaders_(sheet);
  return sheet;
}

function assertHeaders_(sheet) {
  var actual = sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0];
  if (JSON.stringify(actual) !== JSON.stringify(HEADERS)) {
    problem_('SHEET_FORMAT', 'The Setters column headings changed. Restore the original headings.');
  }
}

function cleanSelection_(value, allowSets) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) problem_('INVALID', 'Invalid setter choices.');
  var clean = {setters: [], fallbacks: [], system: value.system || 'single'};
  if (['single', 'back-row', 'front-row'].indexOf(clean.system) === -1) problem_('INVALID', 'Unknown setting system.');
  ['setters', 'fallbacks'].forEach(function (key) {
    var numbers = value[key] || [];
    if (!Array.isArray(numbers) || numbers.length > 20) problem_('INVALID', 'Invalid shirt numbers.');
    numbers.forEach(function (number) {
      number = String(number);
      if (!/^[1-9][0-9]?$/.test(number)) problem_('INVALID', 'Shirt numbers must be 1–99.');
      if (clean[key].indexOf(number) === -1) clean[key].push(number);
    });
  });
  if (clean.setters.some(function (n) { return clean.fallbacks.indexOf(n) !== -1; })) {
    problem_('INVALID', 'A player cannot be both setter and backup.');
  }
  if (value.sets !== undefined) {
    if (!allowSets || !value.sets || typeof value.sets !== 'object' || Array.isArray(value.sets)) problem_('INVALID', 'Invalid set overrides.');
    clean.sets = {};
    Object.keys(value.sets).forEach(function (number) {
      if (!/^[1-5]$/.test(number)) problem_('INVALID', 'Set overrides must be 1–5.');
      clean.sets[number] = cleanSelection_(value.sets[number], false);
    });
  }
  return clean;
}

function key_(leagueId, team, matchId) {
  return JSON.stringify([String(leagueId), team, String(matchId)]);
}

function record_(row) {
  return {leagueId: String(row[1]), team: String(row[2]), matchId: String(row[3]),
    choices: cleanSelection_(JSON.parse(row[8]), true), revision: Number(row[9]),
    updatedAt: String(row[10]), updatedBy: String(row[11])};
}

function rows_(sheet) {
  return sheet.getLastRow() < 2 ? [] : sheet.getRange(2, 1, sheet.getLastRow() - 1, HEADERS.length).getValues();
}

function json_(value, callback) {
  var text = JSON.stringify(value);
  if (callback) {
    if (!/^ksv_cb_[a-f0-9]{32}$/.test(callback)) return ContentService.createTextOutput('Invalid callback');
    return ContentService.createTextOutput(callback + '(' + text + ');').setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(text).setMimeType(ContentService.MimeType.JSON);
}

function publicError_(error) {
  return {ok: false, code: error.publicCode || 'SERVER',
    message: error.publicCode ? error.message : 'Google could not finish this request. Try again; the owner can check Apps Script executions.'};
}

function receipt_(id, value) {
  try { CacheService.getScriptCache().put('receipt:' + id, JSON.stringify(value), 300); } catch (ignored) {}
}

function doGet(e) {
  var p = e && e.parameter || {};
  try {
    if (!p.action) return json_({ok: true, service: 'KSV shared coach choices', version: 1});
    if (p.action === 'read') {
      return json_({ok: true, version: 1, records: rows_(sheet_()).map(record_)}, p.callback);
    }
    if (p.action === 'receipt' && /^[a-f0-9]{32}$/.test(p.requestId || '')) {
      var cached = CacheService.getScriptCache().get('receipt:' + p.requestId);
      if (cached) return json_({ok: true, receipt: JSON.parse(cached)}, p.callback);
      // Cache entries are best effort. Successful saves also have a durable ID.
      var row = rows_(sheet_()).filter(function (r) { return r[12] === p.requestId; })[0];
      return json_({ok: true, receipt: row ? {ok: true, requestId: p.requestId, record: record_(row)} : null}, p.callback);
    }
    return json_({ok: false, code: 'INVALID', message: 'Unknown read action.'}, p.callback);
  } catch (error) { return json_(publicError_(error), p.callback); }
}

function doPost(e) {
  var request, result;
  try {
    var body = e && e.postData && e.postData.contents;
    if (!body || body.length > 16000) problem_('INVALID', 'The save request is empty or too large.');
    request = JSON.parse(body);
    if (!/^[a-f0-9]{32}$/.test(request.requestId || '')) problem_('INVALID', 'Invalid request ID.');
    var expected = PropertiesService.getScriptProperties().getProperty('COACH_PASSWORD');
    if (!expected) problem_('SETUP', 'The owner needs to set the coach password in Apps Script.');
    if (typeof request.password !== 'string' || request.password !== expected) problem_('PASSWORD', 'That coach code is not correct.');
    if (request.action !== 'save') problem_('INVALID', 'Unknown save action.');
    if (!/^\d{1,12}$/.test(String(request.leagueId)) || !/^\d{1,12}$/.test(String(request.matchId))) problem_('INVALID', 'Invalid league or match ID.');
    if (typeof request.team !== 'string' || !request.team.trim() || request.team.length > 150 || /[\u0000-\u001f]/.test(request.team)) problem_('INVALID', 'Invalid team name.');
    if (!Number.isSafeInteger(request.expectedRevision) || request.expectedRevision < 0) problem_('INVALID', 'Missing record revision.');
    if (typeof request.updatedBy !== 'string' || !request.updatedBy.trim() || request.updatedBy.length > 60 || /[\u0000-\u001f]/.test(request.updatedBy)) problem_('INVALID', 'Enter your name (up to 60 characters).');
    var choices = cleanSelection_(request.choices, true);
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(10000)) problem_('BUSY', 'Another save is in progress. Try again in a moment.');
    try {
      var sheet = sheet_(), rows = rows_(sheet);
      var key = key_(request.leagueId, request.team, request.matchId);
      var index = rows.findIndex(function (row) { return row[0] === key; });
      var previous = index < 0 ? null : record_(rows[index]);
      if (index >= 0 && rows[index][12] === request.requestId) {
        result = {ok: true, requestId: request.requestId, record: previous};
      } else if ((previous ? previous.revision : 0) !== request.expectedRevision) {
        result = {ok: false, code: 'CONFLICT', requestId: request.requestId,
          message: 'Another coach changed this match. Load the latest choices before saving again.', current: previous};
      } else {
        var updatedAt = new Date().toISOString();
        var row = [key, String(request.leagueId), request.team, String(request.matchId),
          choices.setters.join(', '), choices.fallbacks.join(', '), choices.system,
          JSON.stringify(choices.sets || {}), JSON.stringify(choices), request.expectedRevision + 1,
          updatedAt, request.updatedBy.trim(), request.requestId];
        // Literal text formatting and escaping prevent names becoming formulas.
        var safeRow = row.map(function (v) { return typeof v === 'string' && /^[=+@\-]/.test(v) ? "'" + v : v; });
        sheet.getRange(index < 0 ? sheet.getLastRow() + 1 : index + 2, 1, 1, HEADERS.length)
          .setNumberFormat('@').setValues([safeRow]);
        SpreadsheetApp.flush();
        result = {ok: true, requestId: request.requestId, record: record_(row)};
      }
    } finally { lock.releaseLock(); }
  } catch (error) {
    result = publicError_(error);
    if (request && /^[a-f0-9]{32}$/.test(request.requestId || '')) result.requestId = request.requestId;
  }
  if (result.requestId) receipt_(result.requestId, result);
  return json_(result);
}
