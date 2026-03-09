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
const HUBSPOT_API_KEY   = pat-na2-054b9905-fc73-43ed-8c3f-605644159afc;

app.use(cors());
app.use(express.json());
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.use(express.static(path.join(__dirname, 'public')));

const upload = multer({ dest: 'uploads/', limits: { fileSize: 10 * 1024 * 1024 } });

// ── HubSpot Lead Check ────────────────────────────────────────────────────────
// Checks by phone first, then by company/brand name
// Returns: { exists: bool, matchedBy: 'phone'|'company'|null, contactId, contactName, hsLink }
async function checkHubSpotLead(phone, brandName) {
  if (!HUBSPOT_API_KEY) return { exists: false, matchedBy: null };

  const headers = {
    'Authorization': `Bearer ${HUBSPOT_API_KEY}`,
    'Content-Type': 'application/json'
  };

  // ── 1. Search by phone ──────────────────────────────────────────────
  if (phone) {
    try {
      // Clean phone: strip spaces, dashes, brackets for a cleaner search
      const cleanPhone = phone.replace(/[\s\-().+]/g, '');

      const phoneRes = await axios.post(
        'https://api.hubapi.com/crm/v3/objects/contacts/search',
        {
          filterGroups: [{
            filters: [{
              propertyName: 'phone',
              operator: 'CONTAINS_TOKEN',
              value: cleanPhone
            }]
          }],
          properties: ['firstname', 'lastname', 'phone', 'company'],
          limit: 1
        },
        { headers, timeout: 8000 }
      );

      if (phoneRes.data?.results?.length > 0) {
        const contact = phoneRes.data.results[0];
        const contactName = `${contact.properties.firstname || ''} ${contact.properties.lastname || ''}`.trim();
        return {
          exists: true,
          matchedBy: 'phone',
          contactId: contact.id,
          contactName: contactName || 'Unknown',
          company: contact.properties.company || '',
          hsLink: `https://app.hubspot.com/contacts/${contact.id}`
        };
      }
    } catch (err) {
      console.warn('HubSpot phone search failed:', err.message);
    }
  }

  // ── 2. Search by company/brand name ────────────────────────────────
  if (brandName) {
    try {
      // First search companies
      const companyRes = await axios.post(
        'https://api.hubapi.com/crm/v3/objects/companies/search',
        {
          filterGroups: [{
            filters: [{
              propertyName: 'name',
              operator: 'CONTAINS_TOKEN',
              value: brandName
            }]
          }],
          properties: ['name', 'domain'],
          limit: 1
        },
        { headers, timeout: 8000 }
      );

      if (companyRes.data?.results?.length > 0) {
        const company = companyRes.data.results[0];
        return {
          exists: true,
          matchedBy: 'company',
          contactId: company.id,
          contactName: company.properties.name || brandName,
          company: company.properties.name || '',
          hsLink: `https://app.hubspot.com/contacts/companies/${company.id}`
        };
      }
    } catch (err) {
      console.warn('HubSpot company search failed:', err.message);
    }
  }

  return { exists: false, matchedBy: null };
}

// ── Main Scan Route ───────────────────────────────────────────────────────────
app.post('/api/scan', upload.single('card'), async (req, res) => {
  const scannerName  = req.body.scannerName  || 'Unknown';
  const scannerEmail = req.body.scannerEmail || '';
  const manualOnly   = req.body.manualOnly  === 'true';
  const extractOnly  = req.body.extractOnly === 'true';
  const saveOnly     = req.body.saveOnly    === 'true';
  const editedCard   = req.body.editedCard  ? JSON.parse(req.body.editedCard) : null;

  // Scan detail fields
  const pos         = req.body.pos         || '';
  const outletName  = req.body.outletName  || '';
  const storeCount  = req.body.storeCount  || '';
  const comments    = req.body.comments    || '';
  const intentToBuy = req.body.intentToBuy || '';

  try {
    let cardData = {};

    if (saveOnly && editedCard) {
      // ── Use reviewed/edited card data ───────────────────────────────
      cardData = editedCard;

    } else if (manualOnly) {
      // ── Manual entry: fields sent directly ─────────────────────────
      cardData = {
        brandName:       req.body.brandName   || '',
        personName:      req.body.personName  || '',
        designation:     req.body.designation || '',
        phone:           req.body.phone       || '',
        city:            req.body.city        || '',
        pos:             req.body.pos         || '',
        storeCount:      req.body.storeCount  || '',
        comments:        req.body.comments    || '',
        intentToBuy:     req.body.intentToBuy || '',
        department: '', email: '', alternatePhone: '',
        website: '', address: '', state: '', country: '',
        pincode: ''
      };

    } else if (req.file) {
      // ── Claude OCR ─────────────────────────────────────────────────
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
{"brandName":"","personName":"","designation":"","department":"","email":"","phone":"","alternatePhone":"","website":"","address":"","city":"","state":"","country":"","pincode":""}` }
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
    cardData.pos         = pos        || cardData.pos        || '';
    cardData.outletName  = outletName;
    cardData.storeCount  = storeCount || cardData.storeCount || '';
    cardData.comments    = comments;
    cardData.intentToBuy = intentToBuy || cardData.intentToBuy || '';

    // ── If extractOnly: return for review, don't save ──────────────
    if (extractOnly) {
      if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.json({ success: true, cardData, sheetSuccess: false, sheetMessage: '' });
    }

    // ── HubSpot Lead Check ─────────────────────────────────────────
    let hsResult = { exists: false, matchedBy: null };
    try {
      hsResult = await checkHubSpotLead(cardData.phone, cardData.brandName);
    } catch (err) {
      console.warn('HubSpot check error (non-fatal):', err.message);
    }

    // ── Save to Sheet + Drive via Apps Script ──────────────────────
    let sheetSuccess = false, sheetMessage = '', driveUrl = '';

    if (APPS_SCRIPT_URL) {
      try {
        const payload = {
          ...cardData,
          scannedBy:     scannerName,
          scannedEmail:  scannerEmail,
          scannedAt:     new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
          scannerFolder: scannerName,
          // Pass HS status to sheet as well
          hsExists:      hsResult.exists ? 'Yes' : 'No',
          hsMatchedBy:   hsResult.matchedBy || '',
          hsLink:        hsResult.hsLink    || ''
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

    res.json({
      success: true,
      cardData,
      sheetSuccess,
      sheetMessage,
      driveUrl,
      hubspot: {
        exists:      hsResult.exists,
        matchedBy:   hsResult.matchedBy,   // 'phone' | 'company' | null
        contactName: hsResult.contactName || '',
        company:     hsResult.company     || '',
        hsLink:      hsResult.hsLink      || ''
      }
    });

  } catch (err) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    console.error('Error:', err.response?.data || err.message);
    res.status(500).json({ error: err.message || 'Processing failed' });
  }
});

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => {
  console.log(`\n🚀 CardScan running at http://localhost:${PORT}`);
  console.log(`📋 Anthropic:   ${ANTHROPIC_API_KEY ? '✓' : '✗'}`);
  console.log(`📊 Apps Script: ${APPS_SCRIPT_URL   ? '✓' : '✗'}`);
  console.log(`🔗 HubSpot:     ${HUBSPOT_API_KEY   ? '✓' : '✗'}\n`);
});