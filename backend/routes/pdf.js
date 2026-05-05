// backend/routes/pdf.js
// ---------------------------------------------------------------
// POST /generate-pdf
// Accepts JSON resume data + a template name, renders it to HTML
// with generateHTML(), converts the HTML to a PDF using Puppeteer,
// and streams the PDF back to the client.
// ---------------------------------------------------------------

const express = require('express');
const puppeteer = require('puppeteer');
const { generateHTML } = require('../utils/generateHTML');

const router = express.Router();

router.post('/', async (req, res) => {
  const { resumeData = {}, template = 'classic' } = req.body || {};

  let browser;
  try {
    // Build the HTML string from the user's resume data.
    const html = generateHTML(resumeData, template);

    // Launch headless Chromium.
    // `--no-sandbox` is required when running as root inside Docker.
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      // If Puppeteer's bundled Chromium was skipped (Docker), use the system one.
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    });

    const page = await browser.newPage();

    // `setContent` loads our HTML directly (no network request).
    await page.setContent(html, { waitUntil: 'networkidle0' });

    // Render to A4 PDF.
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0', bottom: '0', left: '0', right: '0' },
    });

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${(resumeData.name || 'resume').replace(/\s+/g, '_')}.pdf"`,
      'Content-Length': pdfBuffer.length,
    });
    res.send(pdfBuffer);
  } catch (err) {
    console.error('PDF generation failed:', err);
    res.status(500).json({ error: 'Failed to generate PDF', details: err.message });
  } finally {
    if (browser) await browser.close();
  }
});

module.exports = router;
