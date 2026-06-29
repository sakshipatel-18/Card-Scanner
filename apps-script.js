// ════════════════════════════════════════════════════════════════════════════
//  CARD SCANNER — Google Apps Script
// ════════════════════════════════════════════════════════════════════════════

// ── ✏️  EDIT THESE TWO LINES ─────────────────────────────────────────────────
const SHEET_ID        = '1uKv8UKCz-uBz45Q7Tj7kpNFfQY-NqUlzPThHCKoSKrI';
const DRIVE_FOLDER_ID = '1f0QusXbNWbXL-1wDnuNzY4W-J6KdXjSz';
// ─────────────────────────────────────────────────────────────────────────────

const SHEET_TAB = 'Sheet1';

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
  'POS',
  'Store Count',
  'Intent to Buy',
  'Comments',
  'Scanned By',
  'Scanned Email',
  'Scanned At',
  'Card Image URL',
  'Type',
  'For'
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

function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || '';
  if (action === 'counts') return getCounts(e);
  if (action === 'data')   return getData();
  return jsonOut({ ok: true, message: 'CardScan Apps Script is running.' });
}

function getCounts(e) {
  try {
    const scannedBy = ((e.parameter.scannedBy) || '').toLowerCase().trim();
    const date      = ((e.parameter.date)      || '').trim();
    const sheet     = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_TAB);
    const allData   = sheet.getDataRange().getValues();
    if (allData.length <= 1) return jsonOut({ sql: 0, nsql: 0 });

    const headers = allData[0].map(String);
    const byCol   = headers.indexOf('Scanned By');
    const atCol   = headers.indexOf('Scanned At');
    const posCol  = headers.indexOf('POS');
    if (byCol < 0 || posCol < 0) return jsonOut({ sql: 0, nsql: 0 });

    const sqlSet = new Set(SQL_POS_ARR);
    let sql = 0, nsql = 0;
    for (let i = 1; i < allData.length; i++) {
      const row    = allData[i];
      const rowBy  = String(row[byCol]  || '').toLowerCase().trim();
      const rowAt  = String(row[atCol]  || '');
      const rowPos = String(row[posCol] || '').toLowerCase().trim().replace(/\s+/g, ' ');
      if ((!scannedBy || rowBy === scannedBy) && (!date || rowAt.includes(date))) {
        sqlSet.has(rowPos) ? sql++ : nsql++;
      }
    }
    return jsonOut({ sql, nsql });
  } catch (err) {
    return jsonOut({ sql: 0, nsql: 0, error: err.message });
  }
}

function getData() {
  try {
    const sheet   = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_TAB);
    const allData = sheet.getDataRange().getValues();
    if (allData.length <= 1) return jsonOut({ rows: [] });
    const headers = allData[0].map(String);
    const rows    = allData.slice(1).map(row => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = String(row[i] == null ? '' : row[i]); });
      return obj;
    });
    return jsonOut({ rows });
  } catch (err) {
    return jsonOut({ rows: [], error: err.message });
  }
}

function doPost(e) {
  try {
    const data  = JSON.parse(e.postData.contents);
    const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_TAB);
    if (sheet.getLastRow() === 0) setupHeaders();

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
      }
    }

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
      data.pos            || '',
      data.storeCount     || '',
      data.intentToBuy    || '',
      data.comments       || '',
      data.scannedBy      || 'Unknown',
      data.scannedEmail   || '',
      data.scannedAt      || new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
      cardImageUrl,
      data.entryType      || 'Card Scan',
      data.forBrand       || ''
    ];

    sheet.appendRow(row);
    sheet.autoResizeColumns(1, HEADERS.length);
    return jsonOut({ success: true, driveUrl: cardImageUrl });

  } catch (err) {
    Logger.log('doPost error: ' + err.message);
    return jsonOut({ success: false, error: err.message });
  }
}

function saveImageToDrive(base64Data, mimeType, fileName, scannerName) {
  let parentFolder;
  try {
    parentFolder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
  } catch (err) {
    parentFolder = DriveApp.getRootFolder();
  }
  const safeName = (scannerName || 'Unknown').replace(/[^a-zA-Z0-9 \-_]/g, '').trim();
  const existing = parentFolder.getFoldersByName(safeName);
  const folder   = existing.hasNext() ? existing.next() : parentFolder.createFolder(safeName);
  const file     = folder.createFile(
    Utilities.newBlob(Utilities.base64Decode(base64Data), mimeType, fileName)
  );
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return file.getUrl();
}

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function testInsert() {
  const mockData = {
    brandName: 'Acme Corp', personName: 'Ravi Sharma', designation: 'Manager',
    department: 'Sales', email: 'ravi@acme.com', phone: '9876543210',
    city: 'Bengaluru', state: 'Karnataka', country: 'India',
    pos: 'PetPooja', storeCount: '8', intentToBuy: 'Hot',
    comments: 'Met at trade show', forBrand: 'Reelo',
    scannedBy: 'Test User', scannedEmail: 'test@company.com',
    scannedAt: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
    entryType: 'Card Scan'
  };
  const e = { postData: { contents: JSON.stringify(mockData) } };
  Logger.log(doPost(e).getContent());
}