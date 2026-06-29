// ════════════════════════════════════════════════════════════════════════════
//  CARD SCANNER — Google Apps Script
//
//  ► STEP 1: Change SHEET_ID to your new Google Sheet ID
//  ► STEP 2: Change DRIVE_FOLDER_ID to your Drive folder ID
//  ► STEP 3: Save → Deploy as Web App → copy the new URL
//  ► STEP 4: Paste the new URL into index.html line 344 and into Render env vars
// ════════════════════════════════════════════════════════════════════════════

// ── ✏️  EDIT THESE TWO LINES ─────────────────────────────────────────────────
const SHEET_ID        = '1uKv8UKCz-uBz45Q7Tj7kpNFfQY-NqUlzPThHCKoSKrI';   // ← Paste your Sheet ID
const DRIVE_FOLDER_ID = '1f0QusXbNWbXL-1wDnuNzY4W-J6KdXjSz';       // ← Paste your Drive folder ID
// ─────────────────────────────────────────────────────────────────────────────

const SHEET_TAB = 'Sheet1';

// ── SQL POS set — must match the frontend SQL_POS set in index.html ───────────
const SQL_POS_ARR = [
  'petpooja','pp','posist','ezeepos','eezeepos','gofrugal','websys','ciferon',
  'centramation','posify','tmbill','sparrowpos','vasypos','vasy pos','vasy',
  'sanguinepos','sanguine pos','horecafox','allpos','digitory','quickbill','binix',
  'rista by dotpe','rista','dotpe','lucid','lucidpos','lucid pos','quintapos',
  'quinta','quinta pos','csat','csatpos','royalpos','royal','royal pos','qpos',
  'happyonpos','romio','romiopos','dataman','posist (restroworks)','restroworks',
  'billing fast pos','billingfastpos','billingfast pos','devourin','devorin',
  'airmenus','air menu','airmenu','chefdeskpos','chef desk pos','chefdesk pos',
  'devoruinpos','devoruin','devoruin pos','mishipay','mishipaypos','mishi pay',
  'misipay','misi pay','abitzu','sparktech','sparktech pos'
];

// ── Column headers (order matters — matches the row array in doPost) ──────────
const HEADERS = [
  'Brand Name',       // 1
  'Person Name',      // 2
  'Designation',      // 3
  'Department',       // 4
  'Email',            // 5
  'Phone',            // 6
  'Alternate Phone',  // 7
  'Website',          // 8
  'Address',          // 9
  'City',             // 10
  'State',            // 11
  'Country',          // 12
  'Pincode',          // 13
  'LinkedIn',         // 14
  'Twitter',          // 15
  'Other Info',       // 16
  'POS',              // 17
  'Store Count',      // 18
  'Intent to Buy',    // 19  ← Added
  'Comments',         // 20
  'Scanned By',       // 21
  'Scanned Email',    // 22
  'Scanned At',       // 23
  'Card Image URL'    // 24  ← Added (Drive link to scanned card photo)
];

// ── Setup headers if sheet is empty ──────────────────────────────────────────
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

// ══════════════════════════════════════════════════════════════════════════════
//  doGet — handles ?action=counts from the frontend (SQL / NSQL scoreboard)
// ══════════════════════════════════════════════════════════════════════════════
function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || '';
  if (action === 'counts') {
    return getCounts(e);
  }
  // Health-check ping
  return jsonOut({ ok: true, message: 'CardScan Apps Script is running.' });
}

function getCounts(e) {
  try {
    const scannedBy = ((e.parameter.scannedBy) || '').toLowerCase().trim();
    const date      = ((e.parameter.date)      || '').trim();   // e.g. "29/06/2025"

    const sheet   = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_TAB);
    const allData = sheet.getDataRange().getValues();

    // No data yet
    if (allData.length <= 1) return jsonOut({ sql: 0, nsql: 0 });

    const headers      = allData[0].map(String);
    const byCol        = headers.indexOf('Scanned By');
    const atCol        = headers.indexOf('Scanned At');
    const posCol       = headers.indexOf('POS');

    if (byCol < 0 || posCol < 0) return jsonOut({ sql: 0, nsql: 0 });

    const sqlSet = new Set(SQL_POS_ARR);
    let sql = 0, nsql = 0;

    for (let i = 1; i < allData.length; i++) {
      const row    = allData[i];
      const rowBy  = String(row[byCol]  || '').toLowerCase().trim();
      const rowAt  = String(row[atCol]  || '');
      const rowPos = String(row[posCol] || '').toLowerCase().trim().replace(/\s+/g, ' ');

      const byMatch   = !scannedBy || rowBy === scannedBy;
      const dateMatch = !date      || rowAt.includes(date);

      if (byMatch && dateMatch) {
        if (sqlSet.has(rowPos)) { sql++;  }
        else                    { nsql++; }
      }
    }

    return jsonOut({ sql, nsql });
  } catch (err) {
    Logger.log('getCounts error: ' + err.message);
    return jsonOut({ sql: 0, nsql: 0, error: err.message });
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  doPost — saves card data + optional card image to Drive
// ══════════════════════════════════════════════════════════════════════════════
function doPost(e) {
  try {
    const data  = JSON.parse(e.postData.contents);
    const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_TAB);
    if (sheet.getLastRow() === 0) setupHeaders();

    // ── Save card image to Drive if provided ──────────────────────────────────
    let cardImageUrl = '';
    if (data.imageBase64) {
      try {
        cardImageUrl = saveImageToDrive(
          data.imageBase64,
          data.imageMime     || 'image/jpeg',
          data.imageFileName || 'card.jpg',
          data.scannedBy     || 'Unknown'
        );
      } catch (imgErr) {
        Logger.log('Drive upload error: ' + imgErr.message);
        // Non-fatal: continue saving the row even if image upload fails
      }
    }

    const row = [
      data.brandName      || '',   // 1  Brand Name
      data.personName     || '',   // 2  Person Name
      data.designation    || '',   // 3  Designation
      data.department     || '',   // 4  Department
      data.email          || '',   // 5  Email
      data.phone          || '',   // 6  Phone
      data.alternatePhone || '',   // 7  Alternate Phone
      data.website        || '',   // 8  Website
      data.address        || '',   // 9  Address
      data.city           || '',   // 10 City
      data.state          || '',   // 11 State
      data.country        || '',   // 12 Country
      data.pincode        || '',   // 13 Pincode
      data.linkedin       || '',   // 14 LinkedIn
      data.twitter        || '',   // 15 Twitter
      data.otherInfo      || '',   // 16 Other Info
      data.pos            || '',   // 17 POS
      data.storeCount     || '',   // 18 Store Count
      data.intentToBuy    || '',   // 19 Intent to Buy  ← New
      data.comments       || '',   // 20 Comments
      data.scannedBy      || 'Unknown',  // 21 Scanned By
      data.scannedEmail   || '',         // 22 Scanned Email
      data.scannedAt      || new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }), // 23
      cardImageUrl                       // 24 Card Image URL  ← New
    ];

    sheet.appendRow(row);
    sheet.autoResizeColumns(1, HEADERS.length);

    return jsonOut({ success: true, driveUrl: cardImageUrl });

  } catch (err) {
    Logger.log('doPost error: ' + err.message);
    return jsonOut({ success: false, error: err.message });
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  Drive upload — saves image into a per-scanner subfolder
// ══════════════════════════════════════════════════════════════════════════════
function saveImageToDrive(base64Data, mimeType, fileName, scannerName) {
  // Get the parent folder (falls back to My Drive if ID is wrong)
  let parentFolder;
  try {
    parentFolder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
  } catch (err) {
    Logger.log('Drive folder not found, using My Drive: ' + err.message);
    parentFolder = DriveApp.getRootFolder();
  }

  // Find or create a subfolder named after the scanner
  const safeName   = (scannerName || 'Unknown').replace(/[^a-zA-Z0-9 \-_]/g, '').trim();
  const existing   = parentFolder.getFoldersByName(safeName);
  const folder     = existing.hasNext() ? existing.next() : parentFolder.createFolder(safeName);

  // Decode base64 → blob → file
  const imageBytes = Utilities.base64Decode(base64Data);
  const blob       = Utilities.newBlob(imageBytes, mimeType, fileName);
  const file       = folder.createFile(blob);

  // Make it viewable by anyone with the link
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  return file.getUrl();   // Returns the Drive view URL
}

// ── Utility ───────────────────────────────────────────────────────────────────
function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Test — run this manually from the Apps Script editor to verify setup ──────
function testInsert() {
  const mockData = {
    brandName: 'Acme Corp', personName: 'Ravi Sharma', designation: 'Manager',
    department: 'Sales', email: 'ravi@acme.com', phone: '+91 98765 43210',
    alternatePhone: '', website: 'www.acme.com', address: '42 MG Road',
    city: 'Bengaluru', state: 'Karnataka', country: 'India', pincode: '560001',
    linkedin: '', twitter: '', otherInfo: '',
    pos: 'PetPooja', storeCount: '5', intentToBuy: 'Hot', comments: 'Met at trade show',
    scannedBy: 'Test User', scannedEmail: 'test@company.com',
    scannedAt: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
  };
  const e = { postData: { contents: JSON.stringify(mockData) } };
  Logger.log(doPost(e).getContent());
}