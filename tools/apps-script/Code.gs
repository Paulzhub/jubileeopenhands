/**
 * Jubilee Open Hands — Google Sheet → website data feed.
 *
 * 1. Run setup() once: it creates the Settings, Members, Contributions and Expenses tabs
 *    and fills them with the group's data up to November 2026.
 * 2. Deploy → New deployment → Web app (Execute as: Me, Who has access: Anyone).
 * 3. Paste the /exec URL into js/config.js (SHEET_URL) in the website repo.
 *
 * From then on, edit the sheet: tick a box when someone pays, add a row for a new month
 * (or use the "Jubilee" menu → "Add next month"), add a row to Expenses when money goes out.
 */

const TABS = { settings: 'Settings', members: 'Members', contributions: 'Contributions', expenses: 'Expenses' };

/* ---------- web app: the website reads this ---------- */
function doGet() {
  const data = buildLedger_(SpreadsheetApp.getActiveSpreadsheet());
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

function buildLedger_(ss) {
  const tz = ss.getSpreadsheetTimeZone();
  const monthKey = v => {
    if (v instanceof Date) return Utilities.formatDate(v, tz, 'yyyy-MM');
    const s = String(v || '').trim();
    const m = s.match(/^(\d{4})-(\d{1,2})/);
    return m ? m[1] + '-' + ('0' + m[2]).slice(-2) : '';
  };

  // Settings: Key | Value
  const settings = {};
  rows_(ss, TABS.settings).forEach(r => { if (r[0]) settings[String(r[0]).trim().toLowerCase()] = r[1]; });

  // Members: id | name | short | initials
  const members = rows_(ss, TABS.members)
    .filter(r => r[0] && r[1])
    .map(r => ({ id: String(r[0]).trim(), name: String(r[1]).trim(), short: String(r[2] || r[1]).trim(), initials: String(r[3] || '').trim() || initials_(r[1]) }));
  const findMember = label => {
    const k = String(label || '').trim().toLowerCase();
    return members.find(m => [m.id, m.name, m.short].some(x => x.toLowerCase() === k));
  };

  // Contributions: Month | <one column per member> (tick box = paid)
  const cs = ss.getSheetByName(TABS.contributions);
  const values = cs ? cs.getDataRange().getValues() : [[]];
  const header = values[0].map(findMember);
  const months = values.slice(1)
    .map(r => ({ month: monthKey(r[0]), paid: header.map((m, i) => (m && (r[i] === true || /^(yes|y|paid|✅|true|1)$/i.test(String(r[i]).trim())) ? m.id : null)).filter(Boolean) }))
    .filter(m => m.month)
    .sort((a, b) => a.month.localeCompare(b.month));

  // Expenses: Month | Kind | Title | Per member (₹) | Members ("all" or names/ids, comma separated)
  const expenses = rows_(ss, TABS.expenses)
    .filter(r => monthKey(r[0]) && r[2] && Number(r[3]) > 0)
    .map((r, i) => {
      const who = String(r[4] || 'all').trim();
      const ids = /^all$/i.test(who) ? members.map(m => m.id) : who.split(',').map(findMember).filter(Boolean).map(m => m.id);
      return { id: 'exp-' + (i + 1), month: monthKey(r[0]), kind: String(r[1] || 'Expense').trim(), title: String(r[2]).trim(), perMember: Number(r[3]), members: ids };
    });

  return {
    group: String(settings['group name'] || 'Jubilee Open Hands'),
    currency: String(settings['currency'] || 'INR'),
    monthlyDue: Number(settings['monthly due (₹)'] || settings['monthly due'] || 500),
    members: members,
    months: months,
    expenses: expenses,
    updated: new Date().toISOString()
  };
}

function rows_(ss, name) {
  const sh = ss.getSheetByName(name);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();
}

function initials_(name) {
  return String(name).trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

/* ---------- one-time setup with the current data ---------- */
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const members = [
    ['paulz', 'Paulz', 'Paulz', 'PZ'],
    ['ms', 'MS', 'MS', 'MS'],
    ['elis', 'Elis Chacha', 'Elis', 'EC'],
    ['emma', 'Emma Zoliannu', 'Emma', 'EZ'],
    ['james', 'Theologian James', 'James', 'TJ']
  ];
  const all = [true, true, true, true, true];
  const contributions = [
    ['2026-06'].concat(all), ['2026-07'].concat(all), ['2026-08'].concat(all),
    ['2026-09'].concat(all), ['2026-10'].concat(all), ['2026-11', true, true, true, true, false]
  ];

  const make = (name, header, data, widths) => {
    let sh = ss.getSheetByName(name);
    if (sh && sh.getLastRow() > 1) { Logger.log(name + ' already has data — left unchanged.'); return null; }
    if (!sh) sh = ss.insertSheet(name);
    sh.clear();
    sh.getRange(1, 1, 1, header.length).setValues([header]).setFontWeight('bold').setBackground('#2C3732').setFontColor('#EEF3F3');
    if (data.length) sh.getRange(2, 1, data.length, header.length).setValues(data);
    sh.setFrozenRows(1);
    (widths || []).forEach((w, i) => sh.setColumnWidth(i + 1, w));
    return sh;
  };

  make(TABS.settings, ['Key', 'Value'], [['Group name', 'Jubilee Open Hands'], ['Monthly due (₹)', 500], ['Currency', 'INR']], [180, 240]);
  make(TABS.members, ['id', 'name', 'short', 'initials'], members, [120, 200, 120, 90]);

  const cs = make(TABS.contributions, ['Month'].concat(members.map(m => m[2])), [], [110, 90, 90, 90, 90, 90]);
  if (cs) {
    cs.getRange(2, 1, 400, 1).setNumberFormat('@');
    cs.getRange(2, 1, contributions.length, contributions[0].length).setValues(contributions);
    cs.getRange(2, 2, contributions.length, members.length).insertCheckboxes();
  }

  const es = make(TABS.expenses, ['Month', 'Kind', 'Title', 'Per member (₹)', 'Members'],
    [['2026-11', 'Sponsorship', 'UESI Churachandpur Diamond Jubilee Celebration', 1000, 'all']], [110, 140, 380, 130, 200]);
  if (es) es.getRange(2, 1, 400, 1).setNumberFormat('@');

  const def = ss.getSheetByName('Sheet1');
  if (def && ss.getSheets().length > 1 && def.getLastRow() === 0) ss.deleteSheet(def);
  SpreadsheetApp.getActiveSpreadsheet().toast('Tabs created. Next: Deploy → New deployment → Web app.', 'Jubilee Open Hands', 8);
}

/* ---------- helper menu for adding a month ---------- */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Jubilee')
    .addItem('Add next month', 'addNextMonth')
    .addItem('Preview website data', 'previewData')
    .addToUi();
}

function addNextMonth() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TABS.contributions);
  const last = sh.getLastRow(), cols = sh.getLastColumn();
  const prev = String(sh.getRange(last, 1).getDisplayValue()).match(/^(\d{4})-(\d{2})/);
  let y = prev ? +prev[1] : new Date().getFullYear(), m = prev ? +prev[2] + 1 : new Date().getMonth() + 1;
  if (m > 12) { m = 1; y++; }
  sh.getRange(last + 1, 1).setNumberFormat('@').setValue(y + '-' + ('0' + m).slice(-2));
  sh.getRange(last + 1, 2, 1, cols - 1).insertCheckboxes();
}

function previewData() {
  const json = JSON.stringify(buildLedger_(SpreadsheetApp.getActiveSpreadsheet()), null, 2);
  SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutput('<pre style="font:12px monospace;white-space:pre-wrap">' + json.replace(/</g, '&lt;') + '</pre>').setWidth(600).setHeight(500), 'What the website will read');
}
