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
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const upload = multer({ dest: 'uploads/', limits: { fileSize: 10 * 1024 * 1024 } });

// ── /api/health ───────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// ── /api/counts — proxies to Apps Script doGet for live SQL/NSQL counts ───────
app.get('/api/counts', async (req, res) => {
  const { scannedBy, date } = req.query;
  if (!APPS_SCRIPT_URL) return res.json({ sql: 0, nsql: 0 });
  try {
    const url = `${APPS_SCRIPT_URL}?action=counts&scannedBy=${encodeURIComponent(scannedBy || '')}&date=${encodeURIComponent(date || '')}`;
    const r   = await axios.get(url, { timeout: 12000 });
    res.json({ sql: r.data.sql ?? 0, nsql: r.data.nsql ?? 0 });
  } catch (err) {
    console.error('Counts error:', err.message);
    res.json({ sql: 0, nsql: 0 });
  }
});

// ── /api/scan — main endpoint: extract card + save to sheet ───────────────────
app.post('/api/scan', upload.single('card'), async (req, res) => {
  const scannerName  = req.body.scannerName  || 'Unknown';
  const scannerEmail = req.body.scannerEmail || '';
  const manualOnly   = req.body.manualOnly   === 'true';
  const extractOnly  = req.body.extractOnly  === 'true';
  const saveOnly     = req.body.saveOnly     === 'true';
  const editedCard   = req.body.editedCard   ? JSON.parse(req.body.editedCard) : null;

  const pos         = req.body.pos         || '';
  const outletName  = req.body.outletName  || '';
  const entryType = manualOnly ? 'Manual' : 'Card Scan';
  const storeCount  = req.body.storeCount  || '';
  const comments    = req.body.comments    || '';
  const intentToBuy = req.body.intentToBuy || '';
  const forBrand    = req.body.forBrand    || '';  // ← ADD


  try {
    let cardData = {};

    // ── Path 1: save edited card from review screen ───────────────────────────
    if (saveOnly && editedCard) {
      cardData = editedCard;

    // ── Path 2: manual entry (no image) ──────────────────────────────────────
    } else if (manualOnly) {
      cardData = {
        brandName:   req.body.brandName   || '',
        personName:  req.body.personName  || '',
        designation: req.body.designation || '',
        phone:       req.body.phone       || '',
        city:        req.body.city        || '',
        pos:         req.body.pos         || '',
        storeCount:  req.body.storeCount  || '',
        comments:    req.body.comments    || '',
        intentToBuy: req.body.intentToBuy || '',
        department: '', email: '', alternatePhone: '', website: '',
        address: '', state: '', country: '', pincode: '',
      };

    // ── Path 3: image scan via Claude ─────────────────────────────────────────
    } else if (req.file) {
      if (!ANTHROPIC_API_KEY) {
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        return res.status(500).json({ error: 'ANTHROPIC_API_KEY is not configured on the server.' });
      }

      const base64Image = fs.readFileSync(req.file.path).toString('base64');
      const mimeType    = req.file.mimetype;

      const claudeRes = await axios.post(
        'https://api.anthropic.com/v1/messages',
        {
          model: 'claude-sonnet-4-6',   // ← Fixed model name
          max_tokens: 1024,
          messages: [{
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: mimeType, data: base64Image }
              },
              {
                type: 'text',
                text: `Extract ALL information from this business card and return ONLY a JSON object (no markdown, no explanation):\n{"brandName":"","personName":"","designation":"","department":"","email":"","phone":"","alternatePhone":"","website":"","address":"","city":"","state":"","country":"","pincode":"","linkedin":"","twitter":""}`
              }
            ]
          }]
        },
        {
          headers: {
            'x-api-key':         ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
            'content-type':      'application/json'
          },
          timeout: 30000
        }
      );

      const rawText = claudeRes.data.content[0].text.trim().replace(/```json|```/g, '').trim();
      cardData = JSON.parse(rawText);

    } else {
      return res.status(400).json({ error: 'No image and no manual data provided.' });
    }

    // Merge extra fields from the form
    cardData.pos         = pos         || cardData.pos         || '';
    cardData.outletName  = outletName;
    cardData.storeCount  = storeCount  || cardData.storeCount  || '';
    cardData.comments    = comments    || cardData.comments    || '';
    cardData.intentToBuy = intentToBuy || cardData.intentToBuy || '';
    cardData.forBrand    = forBrand    || cardData.forBrand    || '';  // ← ADD


    // extractOnly: return the extracted data for the review screen
    if (extractOnly) {
      if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.json({ success: true, cardData, sheetSuccess: false, sheetMessage: '' });
    }

    // ── Save to Google Sheet via Apps Script ──────────────────────────────────
    let sheetSuccess = false, sheetMessage = '', driveUrl = '';

    if (APPS_SCRIPT_URL) {
      try {
        const payload = {
          ...cardData,
          scannedBy:    scannerName,
          entryType,
          scannedEmail: scannerEmail,
          scannedAt:    new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
          scannerFolder: scannerName,
        };

        // Attach image for Drive upload if available
        if (req.file && fs.existsSync(req.file.path)) {
          const safePerson  = (cardData.personName || 'Unknown').replace(/[^a-zA-Z0-9]/g, '_');
          const safeScanner = scannerName.replace(/[^a-zA-Z0-9]/g, '_');
          payload.imageBase64   = fs.readFileSync(req.file.path).toString('base64');
          payload.imageMime     = req.file.mimetype;
          payload.imageFileName = `${safePerson}_${safeScanner}_${new Date().toISOString().slice(0, 10)}.jpg`;
        }

        const scriptRes  = await axios.post(APPS_SCRIPT_URL, payload, { timeout: 30000 });
        sheetSuccess     = true;
        sheetMessage     = manualOnly ? 'Manual entry saved ✓' : 'Saved to Sheet & Drive ✓';
        if (scriptRes.data?.driveUrl) driveUrl = scriptRes.data.driveUrl;

      } catch (err) {
        sheetMessage = 'Save failed: ' + err.message;
        console.error('Apps Script error:', err.message);
      }
    } else {
      sheetMessage = 'APPS_SCRIPT_URL not configured.';
    }

    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.json({ success: true, cardData, sheetSuccess, sheetMessage, driveUrl });

  } catch (err) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    console.error('Scan error:', err.response?.data || err.message);
    res.status(500).json({ error: err.message || 'Processing failed' });
  }
});

app.listen(PORT, () => {
  console.log(`\n🚀 CardScan running at http://localhost:${PORT}`);
  console.log(`📋 Anthropic API: ${ANTHROPIC_API_KEY ? '✓ Configured' : '✗ MISSING — set ANTHROPIC_API_KEY'}`);
  console.log(`📊 Apps Script:   ${APPS_SCRIPT_URL   ? '✓ Configured' : '✗ MISSING — set APPS_SCRIPT_URL'}\n`);
});