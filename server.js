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
const GOOGLE_CLIENT_ID  = process.env.GOOGLE_CLIENT_ID || '';

app.use(cors());
app.use(express.json());

// Inject GOOGLE_CLIENT_ID into the HTML at runtime
app.get('/', (req, res) => {
  let html = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
  html = html.replace('YOUR_GOOGLE_CLIENT_ID', GOOGLE_CLIENT_ID);
  res.send(html);
});

app.use(express.static(path.join(__dirname, 'public')));

const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only images allowed'));
  }
});

// ── OCR Endpoint ──────────────────────────────────────────────────────────────
app.post('/api/scan', upload.single('card'), async (req, res) => {
  const scannerName  = req.body.scannerName  || 'Unknown';
  const scannerEmail = req.body.scannerEmail || '';
  const pos          = req.body.pos          || '';
  const storeCount   = req.body.storeCount   || '';
  const comments     = req.body.comments     || '';

  if (!req.file) return res.status(400).json({ error: 'No image uploaded' });

  try {
    const imageBuffer = fs.readFileSync(req.file.path);
    const base64Image = imageBuffer.toString('base64');
    const mimeType    = req.file.mimetype;

    const claudeResponse = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64Image } },
            { type: 'text', text: `You are a business card OCR expert. Extract ALL information from this business card image and return it ONLY as a JSON object with these exact keys (use empty string "" if not found):
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
Return ONLY valid JSON. No explanation, no markdown, no backticks.` }
          ]
        }]
      },
      { headers: { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' } }
    );

    const rawText  = claudeResponse.data.content[0].text.trim();
    const cardData = JSON.parse(rawText.replace(/```json|```/g, '').trim());

    // Add the extra fields to cardData so they show in results
    cardData.pos        = pos;
    cardData.storeCount = storeCount;
    cardData.comments   = comments;

    let sheetSuccess = false;
    let sheetMessage = '';

    if (APPS_SCRIPT_URL) {
      try {
        await axios.post(APPS_SCRIPT_URL, {
          ...cardData,
          scannedBy:    scannerName,
          scannedEmail: scannerEmail,
          scannedAt:    new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
        });
        sheetSuccess = true;
        sheetMessage = 'Saved to Google Sheet ✓';
      } catch (err) {
        sheetMessage = 'Sheet save failed: ' + err.message;
      }
    } else {
      sheetMessage = 'Apps Script URL not configured';
    }

    fs.unlinkSync(req.file.path);
    res.json({ success: true, cardData, sheetSuccess, sheetMessage });

  } catch (err) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    console.error('Error:', err.response?.data || err.message);
    res.status(500).json({ error: err.message || 'Processing failed' });
  }
});

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => {
  console.log(`\n🚀 Card Scanner Server running at http://localhost:${PORT}`);
  console.log(`📋 Anthropic API:   ${ANTHROPIC_API_KEY  ? '✓ Configured' : '✗ Missing'}`);
  console.log(`📊 Apps Script:     ${APPS_SCRIPT_URL    ? '✓ Configured' : '✗ Missing'}`);
  console.log(`🔐 Google OAuth:    ${GOOGLE_CLIENT_ID   ? '✓ Configured' : '⚠ Not set (fallback mode)'}\n`);
});