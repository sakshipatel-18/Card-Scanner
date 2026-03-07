require('dotenv').config();
const express = require('express');
const multer  = require('multer');
const axios   = require('axios');
const fs      = require('fs');
const path    = require('path');
const cors    = require('cors');

const app  = express();
const PORT = process.env.PORT || 3000;

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const APPS_SCRIPT_URL   = process.env.APPS_SCRIPT_URL;

app.use(cors());
app.use(express.json());
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.use(express.static(path.join(__dirname, 'public')));

const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => file.mimetype.startsWith('image/') ? cb(null, true) : cb(new Error('Images only'))
});

app.post('/api/scan', upload.single('card'), async (req, res) => {
  const scannerName  = req.body.scannerName  || 'Unknown';
  const scannerEmail = req.body.scannerEmail || '';
  const pos          = req.body.pos          || '';
  const storeCount   = req.body.storeCount   || '';
  const comments          = req.body.comments          || '';
  const manualPersonName  = req.body.manualPersonName  || '';
  const manualPhone       = req.body.manualPhone       || '';
  const manualOnly        = req.body.manualOnly === 'true';

  // ── Manual entry (no card image) ─────────────────────────────────────────
  if (manualOnly || !req.file) {
    const cardData = {
      brandName:'', personName: manualPersonName, designation:'', department:'',
      email:'', phone: manualPhone, alternatePhone:'', website:'', address:'',
      city:'', state:'', country:'', pincode:'', linkedin:'', twitter:'', otherInfo:'',
      pos, storeCount, comments, manualPersonName, manualPhone
    };
    let sheetSuccess = false, sheetMessage = '';
    if (APPS_SCRIPT_URL) {
      try {
        await axios.post(APPS_SCRIPT_URL, {
          ...cardData,
          scannedBy: scannerName, scannedEmail: scannerEmail,
          scannedAt: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
          manualPersonName, manualPhone, scannerFolder: scannerName
        }, { timeout: 30000 });
        sheetSuccess = true;
        sheetMessage = 'Manual entry saved to Sheet ✓';
      } catch(err) { sheetMessage = 'Save failed: ' + err.message; }
    }
    return res.json({ success: true, cardData, sheetSuccess, sheetMessage, driveUrl: '' });
  }

  try {
    const base64Image = fs.readFileSync(req.file.path).toString('base64');
    const mimeType    = req.file.mimetype;

    // ── 1. Claude OCR ─────────────────────────────────────────────────────
    const claudeResponse = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64Image } },
            { type: 'text', text: `Extract ALL info from this business card as JSON only (no markdown, no explanation):
{
  "brandName": "",
  "personName": "",
  "designation": "",
  "department": "",
  "email": "",
  "phone": "",
  "alternatePhone": "",
  "website": "",
  "address": "",
  "city": "",
  "state": "",
  "country": "",
  "pincode": "",
  "linkedin": "",
  "twitter": "",
  "otherInfo": ""
}` }
          ]
        }]
      },
      { headers: { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' } }
    );

    const cardData = JSON.parse(claudeResponse.data.content[0].text.trim().replace(/```json|```/g, '').trim());
    cardData.pos              = pos;
    cardData.manualPersonName = manualPersonName;
    cardData.manualPhone      = manualPhone;
    cardData.storeCount = storeCount;
    cardData.comments   = comments;

    // ── 2. Send to Apps Script (Sheet + Drive) ────────────────────────────
    let sheetSuccess = false, sheetMessage = '', driveUrl = '';

    if (APPS_SCRIPT_URL) {
      try {
        // Build a clean filename: CardholderName_ScannerName_Date
        const safePerson  = (cardData.personName || 'UnknownPerson').replace(/[^a-zA-Z0-9]/g, '_');
        const safeScanner = scannerName.replace(/[^a-zA-Z0-9]/g, '_');
        const dateStr     = new Date().toISOString().slice(0, 10);
        const fileName    = `${safePerson}_${safeScanner}_${dateStr}.jpg`;

        const scriptRes = await axios.post(APPS_SCRIPT_URL, {
          ...cardData,
          scannedBy:     scannerName,
          scannedEmail:  scannerEmail,
          scannedAt:     new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
          manualPersonName: manualPersonName,
          manualPhone:      manualPhone,
          // Drive photo fields
          imageBase64:   base64Image,
          imageMime:     mimeType,
          imageFileName: fileName,
          scannerFolder: scannerName   // subfolder = scanner's name
        }, { timeout: 30000 });

        sheetSuccess = true;
        sheetMessage = 'Saved to Sheet & Drive ✓';
        if (scriptRes.data?.driveUrl) driveUrl = scriptRes.data.driveUrl;

      } catch (err) {
        sheetMessage = 'Save failed: ' + err.message;
      }
    }

    fs.unlinkSync(req.file.path);
    res.json({ success: true, cardData, sheetSuccess, sheetMessage, driveUrl });

  } catch (err) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    console.error('Error:', err.response?.data || err.message);
    res.status(500).json({ error: err.message || 'Processing failed' });
  }
});

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => {
  console.log(`\n🚀 Card Scanner running at http://localhost:${PORT}`);
  console.log(`📋 Anthropic: ${ANTHROPIC_API_KEY ? '✓' : '✗'}`);
  console.log(`📊 Apps Script: ${APPS_SCRIPT_URL ? '✓' : '✗'}\n`);
});