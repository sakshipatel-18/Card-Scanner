// ════════════════════════════════════════════════════════════════════════════
//  BUSINESS CARD SCANNER — Google Apps Script (Updated with new columns)
// ════════════════════════════════════════════════════════════════════════════

const SHEET_ID  = '1mzw4TV2mdKMcuKgbQXUYb4-IK94shoDVbMv-Yp4_GX4';
const SHEET_TAB = 'Sheet1';

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
  'POS',              // ← New
  'Store Count',      // ← New
  'Comments',         // ← New
  'Scanned By',
  'Scanned Email',    // ← New (auto from Google Login)
  'Scanned At'
];

function setupHeaders() {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_TAB);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.getRange(1, 1, 1, HEADERS.length)
      .setFontWeight('bold')
      .setBackground('#1a1a2e')
      .setFontColor('#ffffff');
    sheet.setFrozenRows(1);
  }
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_TAB);

    if (sheet.getLastRow() === 0) setupHeaders();

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
      data.pos            || '',       // ← New
      data.storeCount     || '',       // ← New
      data.comments       || '',       // ← New
      data.scannedBy      || 'Unknown',
      data.scannedEmail   || '',       // ← New
      data.scannedAt      || new Date().toLocaleString()
    ];

    sheet.appendRow(row);
    sheet.autoResizeColumns(1, HEADERS.length);

    return ContentService
      .createTextOutput(JSON.stringify({ success: true }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function testInsert() {
  const mockData = {
    brandName: 'Acme Corp', personName: 'Ravi Sharma', designation: 'Manager',
    department: 'Sales', email: 'ravi@acme.com', phone: '+91 98765 43210',
    alternatePhone: '', website: 'www.acme.com', address: '42 MG Road',
    city: 'Bengaluru', state: 'Karnataka', country: 'India', pincode: '560001',
    linkedin: '', twitter: '', otherInfo: '',
    pos: 'Mumbai Store', storeCount: '5', comments: 'Met at trade show',
    scannedBy: 'Sakshi Patel', scannedEmail: 'sakshi@company.com',
    scannedAt: new Date().toLocaleString()
  };
  const e = { postData: { contents: JSON.stringify(mockData) } };
  Logger.log(doPost(e).getContent());
}