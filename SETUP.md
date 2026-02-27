# 🪪 CardScan — Complete Setup Guide

---

## STEP 1 — Install Node.js (if not already installed)
1. Go to https://nodejs.org
2. Download and install the **LTS version**
3. Open Terminal / Command Prompt and verify:
   ```
   node --version
   npm --version
   ```

---

## STEP 2 — Set Up the Google Apps Script

This is the "bridge" between your app and Google Sheets.

1. Open your Google Sheet:
   👉 https://docs.google.com/spreadsheets/d/1mzw4TV2mdKMcuKgbQXUYb4-IK94shoDVbMv-Yp4_GX4/edit

2. Click **Extensions → Apps Script**

3. Delete everything in the editor and **paste the full contents of `apps-script.js`** (from this folder)

4. Click **Save** (💾)

5. Click **Run → testInsert** to test it inserts a row
   - First time: click "Review permissions" → Allow

6. Now **Deploy as Web App**:
   - Click **Deploy → New deployment**
   - Click the gear ⚙️ next to "Select type" → choose **Web app**
   - Description: `CardScan`
   - Execute as: **Me**
   - Who has access: **Anyone**  ← IMPORTANT
   - Click **Deploy**
   - Click **Authorize access** → Allow
   - **Copy the Web App URL** — you'll need it in the next step!
     (looks like: `https://script.google.com/macros/s/XXXX.../exec`)

---

## STEP 3 — Get Your Anthropic API Key

1. Go to: https://console.anthropic.com/
2. Sign in / create an account
3. Go to **API Keys** → click **Create Key**
4. Copy the key (starts with `sk-ant-...`)

---

## STEP 4 — Configure Your .env File

Open the `.env` file in the `card-scanner` folder and fill in:

```
ANTHROPIC_API_KEY=sk-ant-your-key-here
APPS_SCRIPT_URL=https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec
PORT=3000
```

Save the file.

---

## STEP 5 — Install & Run the Server

Open Terminal / Command Prompt, navigate to the card-scanner folder:

```bash
cd card-scanner
npm install
npm start
```

You should see:
```
🚀 Card Scanner Server running at http://localhost:3000
✓ Anthropic API: Configured
✓ Apps Script:   Configured
```

Test it in your browser: http://localhost:3000

---

## STEP 6 — Get a Shareable Public URL (ngrok)

ngrok creates a public URL that tunnels to your localhost.

### Install ngrok:
1. Go to https://ngrok.com → sign up for free
2. Download ngrok for your OS
3. Run the auth command from your ngrok dashboard:
   ```
   ngrok config add-authtoken YOUR_TOKEN
   ```

### Start the tunnel:
Open a NEW terminal window (keep the server running in the first one):
```bash
ngrok http 3000
```

You'll see output like:
```
Forwarding   https://abc123.ngrok-free.app → http://localhost:3000
```

**Share `https://abc123.ngrok-free.app` with your team!** 🎉

> ⚠️ Note: Free ngrok URLs change every time you restart ngrok.
> For a permanent URL, consider ngrok's paid plan or deploying to Render/Railway.

---

## HOW IT WORKS

1. Someone opens the shared link
2. They enter **their name** (this gets recorded in the "Scanned By" column)
3. They upload a photo of a business card
4. Claude AI reads the card and extracts all details
5. Details are **automatically saved to your Google Sheet**
6. The sheet shows: Brand, Person Name, Designation, Phone, Email, Address, etc. + **who scanned it**

---

## Google Sheet Column Layout

| Brand Name | Person Name | Designation | Department | Email | Phone | Alt Phone | Website | Address | City | State | Country | Pincode | LinkedIn | Twitter | Other Info | **Scanned By** | Scanned At |

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Apps Script URL not configured" | Check .env file has correct APPS_SCRIPT_URL |
| Sheet not updating | Re-deploy Apps Script with "Anyone" access |
| Claude API error | Check ANTHROPIC_API_KEY in .env |
| ngrok not connecting | Make sure server is running on port 3000 |
| Image upload fails | Check image is under 10MB and is JPG/PNG/WEBP |
