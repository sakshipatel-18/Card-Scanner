// ════════════════════════════════════════════════════════════════════════════
//  BUSINESS CARD SCANNER — Google Apps Script
//  Paste this entire file into your Apps Script editor, then deploy as Web App
// ════════════════════════════════════════════════════════════════════════════

const SHEET_ID  = '1mzw4TV2mdKMcuKgbQXUYb4-IK94shoDVbMv-Yp4_GX4';
const SHEET_TAB = 'Sheet1'; // Change if your tab has a different name

// Column headers — order matters, must match doPost() below
const HEADERS = [
  'Brand Name',
  'Person Name',
  'Designation',
  'Department',
  'Email',
  'Phone',
  'Alternate Phone',
  'Website',
  'Address',
  'City',
  'State',
  'Country',
  'Pincode',
  'LinkedIn',
  'Twitter',
  'Other Info',
  'Scanned By',      // ← name of person who scanned (last data columns)
  'Scanned At'
];

// ── Called once to add header row ────────────────────────────────────────────
function setupHeaders() {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_TAB);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold').setBackground('#1a1a2e').setFontColor('#ffffff');
    sheet.setFrozenRows(1);
  }
}

// ── Handles incoming POST requests ───────────────────────────────────────────
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);

    const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_TAB);

    // Auto-create headers if sheet is empty
    if (sheet.getLastRow() === 0) setupHeaders();

    // Build the row in same order as HEADERS
    const row = [
      data.brandName      || '',
      data.personName     || '',
      data.designation    || '',
      data.department     || '',
      data.email          || '',
      data.phone          || '',
      data.alternatePhone || '',
      data.website        || '',
      data.address        || '',
      data.city           || '',
      data.state          || '',
      data.country        || '',
      data.pincode        || '',
      data.linkedin       || '',
      data.twitter        || '',
      data.otherInfo      || '',
      data.scannedBy      || 'Unknown',   // ← Who scanned
      data.scannedAt      || new Date().toLocaleString()
    ];

    sheet.appendRow(row);

    // Auto-resize columns
    sheet.autoResizeColumns(1, HEADERS.length);

    return ContentService
      .createTextOutput(JSON.stringify({ success: true, message: 'Row added' }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ── Test function — run manually from editor to test ─────────────────────────
function testInsert() {
  const mockData = {
    brandName:      'Acme Corp',
    personName:     'Ravi Sharma',
    designation:    'Senior Manager',
    department:     'Sales',
    email:          'ravi@acme.com',
    phone:          '+91 98765 43210',
    alternatePhone: '',
    website:        'www.acme.com',
    address:        '42 MG Road',
    city:           'Bengaluru',
    state:          'Karnataka',
    country:        'India',
    pincode:        '560001',
    linkedin:       '',
    twitter:        '',
    otherInfo:      '',
    scannedBy:      'Test User',
    scannedAt:      new Date().toLocaleString()
  };

  const e = { postData: { contents: JSON.stringify(mockData) } };
  const result = doPost(e);
  Logger.log(result.getContent());
}
