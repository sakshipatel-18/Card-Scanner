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

const upload = multer({ dest: 'uploads/', limits: { fileSize: 10 * 1024 * 1024 } });

app.post('/api/scan', upload.single('card'), async (req, res) => {
  const scannerName  = req.body.scannerName  || 'Unknown';
  const scannerEmail = req.body.scannerEmail || '';
  const manualOnly   = req.body.manualOnly  === 'true';
  const extractOnly  = req.body.extractOnly === 'true';
  const saveOnly     = req.body.saveOnly    === 'true';
  const editedCard   = req.body.editedCard  ? JSON.parse(req.body.editedCard) : null;

  // Scan detail fields
  const pos        = req.body.pos        || '';
  const outletName = req.body.outletName || '';
  const storeCount = req.body.storeCount || '';
  const comments   = req.body.comments   || '';

  try {
    let cardData = {};

    if (saveOnly && editedCard) {
      // ── Use reviewed/edited card data ─────────────────────────────────
      cardData = editedCard;

    } else if (manualOnly) {
      // ── Manual entry: fields sent directly ────────────────────────────
      cardData = {
        brandName:       req.body.brandName   || '',
        personName:      req.body.personName  || '',
        designation:     req.body.designation || '',
        phone:           req.body.phone       || '',
        city:            req.body.city        || '',
        department: '', email: '', alternatePhone: '',
        website: '', address: '', state: '', country: '',
        pincode: '', linkedin: '', twitter: '', otherInfo: ''
      };

    } else if (req.file) {
      // ── Claude OCR ────────────────────────────────────────────────────
      const base64Image = fs.readFileSync(req.file.path).toString('base64');
      const mimeType    = req.file.mimetype;

      const claudeRes = await axios.post(
        'https://api.anthropic.com/v1/messages',
        {
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1024,
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64Image } },
              { type: 'text', text: `Extract ALL info from this business card as JSON only (no markdown):
{"brandName":"","personName":"","designation":"","department":"","email":"","phone":"","alternatePhone":"","website":"","address":"","city":"","state":"","country":"","pincode":"","linkedin":"","twitter":"","otherInfo":""}` }
            ]
          }]
        },
        { headers: { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' } }
      );
      cardData = JSON.parse(claudeRes.data.content[0].text.trim().replace(/```json|```/g, '').trim());

    } else {
      return res.status(400).json({ error: 'No image and no manual data provided' });
    }

    // Attach scan detail fields
    cardData.pos        = pos;
    cardData.outletName = outletName;
    cardData.storeCount = storeCount || req.body.storeCount || '';
    cardData.comments   = comments;

    // ── If extractOnly: return for review, don't save ─────────────────
    if (extractOnly) {
      if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.json({ success: true, cardData, sheetSuccess: false, sheetMessage: '' });
    }

    // ── Save to Sheet + Drive via Apps Script ─────────────────────────
    let sheetSuccess = false, sheetMessage = '', driveUrl = '';

    if (APPS_SCRIPT_URL) {
      try {
        const payload = {
          ...cardData,
          scannedBy:     scannerName,
          scannedEmail:  scannerEmail,
          scannedAt:     new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
          scannerFolder: scannerName
        };

        // Attach photo for Drive upload if available
        if (req.file && fs.existsSync(req.file.path)) {
          const safePerson      = (cardData.personName || 'Unknown').replace(/[^a-zA-Z0-9]/g, '_');
          const safeScanner     = scannerName.replace(/[^a-zA-Z0-9]/g, '_');
          payload.imageBase64   = fs.readFileSync(req.file.path).toString('base64');
          payload.imageMime     = req.file.mimetype;
          payload.imageFileName = `${safePerson}_${safeScanner}_${new Date().toISOString().slice(0,10)}.jpg`;
        }

        const scriptRes = await axios.post(APPS_SCRIPT_URL, payload, { timeout: 30000 });
        sheetSuccess = true;
        sheetMessage = manualOnly ? 'Manual entry saved ✓' : 'Saved to Sheet & Drive ✓';
        if (scriptRes.data?.driveUrl) driveUrl = scriptRes.data.driveUrl;
      } catch (err) {
        sheetMessage = 'Save failed: ' + err.message;
      }
    }

    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.json({ success: true, cardData, sheetSuccess, sheetMessage, driveUrl });

  } catch (err) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    console.error('Error:', err.response?.data || err.message);
    res.status(500).json({ error: err.message || 'Processing failed' });
  }
});

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => {
  console.log(`\n🚀 CardScan running at http://localhost:${PORT}`);
  console.log(`📋 Anthropic: ${ANTHROPIC_API_KEY ? '✓' : '✗'}`);
  console.log(`📊 Apps Script: ${APPS_SCRIPT_URL ? '✓' : '✗'}\n`);
});