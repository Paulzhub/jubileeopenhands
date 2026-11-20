// Where the site reads its data from.
// Paste your Google Apps Script web-app URL (it ends in /exec) between the quotes to make the
// Google Sheet the live source. Leave it empty to use data/ledger.json from this repo.
export const SHEET_URL = '';

// How often (seconds) the site checks the sheet for new entries while it is open.
export const REFRESH_SECONDS = 60;
