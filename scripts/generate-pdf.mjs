import puppeteer from 'puppeteer-core';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.resolve(__dirname, '../docs/api-flow-guide.html');
const pdfPath = path.resolve(__dirname, '../docs/ProofArrive-API-Flow-Guide.pdf');

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});

const page = await browser.newPage();
await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle0' });

await page.pdf({
  path: pdfPath,
  format: 'A4',
  printBackground: true,
  margin: { top: '18mm', bottom: '18mm', left: '16mm', right: '16mm' },
  displayHeaderFooter: true,
  headerTemplate: '<div></div>',
  footerTemplate: `
    <div style="width:100%;text-align:center;font-size:8px;color:#94a3b8;font-family:Helvetica,sans-serif;padding:0 20mm;">
      <span>ProofArrive API Flow Guide</span>
      <span style="margin:0 10px;">&bull;</span>
      <span class="pageNumber"></span> / <span class="totalPages"></span>
    </div>`,
});

await browser.close();
console.log(`PDF generated: ${pdfPath}`);
