require('dotenv').config();
const express = require('express');
const multer = require('multer');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const APPS_SCRIPT_URL   = process.env.APPS_SCRIPT_URL; // Your deployed Google Apps Script Web App URL

// ─── MIDDLEWARE ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only images allowed'));
  }
});

// ─── OCR ENDPOINT ─────────────────────────────────────────────────────────────
app.post('/api/scan', upload.single('card'), async (req, res) => {
  const scannerName = req.body.scannerName || 'Unknown';

  if (!req.file) return res.status(400).json({ error: 'No image uploaded' });

  try {
    // Read image and convert to base64
    const imageBuffer = fs.readFileSync(req.file.path);
    const base64Image = imageBuffer.toString('base64');
    const mimeType    = req.file.mimetype;

    // ── Call Claude API for OCR ──
    const claudeResponse = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: mimeType, data: base64Image }
              },
              {
                type: 'text',
                text: `You are a business card OCR expert. Extract ALL information from this business card image and return it ONLY as a JSON object with these exact keys (use empty string "" if not found):
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
}
Return ONLY valid JSON. No explanation, no markdown, no backticks.`
              }
            ]
          }
        ]
      },
      {
        headers: {
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json'
        }
      }
    );

    // Parse Claude's response
    const rawText   = claudeResponse.data.content[0].text.trim();
    const cleanText = rawText.replace(/```json|```/g, '').trim();
    const cardData  = JSON.parse(cleanText);

    // ── Write to Google Sheets via Apps Script ──
    let sheetSuccess = false;
    let sheetMessage = '';

    if (APPS_SCRIPT_URL) {
      try {
        await axios.post(APPS_SCRIPT_URL, {
          ...cardData,
          scannedBy: scannerName,
          scannedAt: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
        });
        sheetSuccess = true;
        sheetMessage = 'Saved to Google Sheet ✓';
      } catch (sheetErr) {
        sheetMessage = 'Sheet save failed: ' + sheetErr.message;
      }
    } else {
      sheetMessage = 'Apps Script URL not configured';
    }

    // Cleanup temp file
    fs.unlinkSync(req.file.path);

    res.json({
      success: true,
      cardData,
      sheetSuccess,
      sheetMessage
    });

  } catch (err) {
    // Cleanup on error
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    console.error('Error:', err.response?.data || err.message);
    res.status(500).json({ error: err.message || 'Processing failed' });
  }
});

// ─── HEALTH CHECK ─────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', appsScriptConfigured: !!APPS_SCRIPT_URL });
});

// ─── START ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 Card Scanner Server running at http://localhost:${PORT}`);
  console.log(`📋 Anthropic API: ${ANTHROPIC_API_KEY ? '✓ Configured' : '✗ Missing - add to .env'}`);
  console.log(`📊 Apps Script:   ${APPS_SCRIPT_URL   ? '✓ Configured' : '✗ Missing - add to .env'}\n`);
});
