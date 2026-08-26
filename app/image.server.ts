import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';

export async function generateLoyaltyCard(
  orderId: string,
  clientName: string,
  kingCode: string,
  otherCode: string
): Promise<string> {
  const publicDir = path.join(process.cwd(), 'public');
  const cardsDir = path.join(publicDir, 'cards');

  // Ensure the cards directory exists
  try {
    await fs.mkdir(cardsDir, { recursive: true });
  } catch (err) {
    // Ignore if exists
  }

  const outputPath = path.join(cardsDir, `${orderId}.pdf`);

  // WhatsApp header image requirement: 1125x600 (16:9 landscape, ~1.91:1 ratio, max 5MB)
  // Generated entirely via SVG — no external template file dependency
  const svgCard = `
<svg width="1125" height="600" xmlns="http://www.w3.org/2000/svg">
  <!-- Black background -->
  <rect width="1125" height="600" fill="#0D0D0D"/>

  <!-- Gold outer border -->
  <rect x="10" y="10" width="1105" height="580" fill="none" stroke="#C9A84C" stroke-width="4" rx="12"/>

  <!-- Top dark bar -->
  <rect x="14" y="14" width="1097" height="110" fill="#1A1A1A" rx="10"/>

  <!-- Brand name (Arabic) -->
  <text x="562" y="75" font-family="Arial, sans-serif" font-size="38" font-weight="bold" fill="#C9A84C" text-anchor="middle" dominant-baseline="middle">مناحل الثنيان</text>

  <!-- Gold divider line -->
  <line x1="60" y1="130" x2="1065" y2="130" stroke="#C9A84C" stroke-width="2"/>

  <!-- VIP badge box (left side) -->
  <rect x="40" y="155" width="200" height="200" fill="#1A1A1A" rx="14" stroke="#C9A84C" stroke-width="2"/>
  <text x="140" y="230" font-family="Arial, sans-serif" font-size="52" fill="#C9A84C" text-anchor="middle" dominant-baseline="middle">👑</text>
  <text x="140" y="290" font-family="Arial, sans-serif" font-size="22" font-weight="bold" fill="#C9A84C" text-anchor="middle">VIP</text>
  <text x="140" y="320" font-family="Arial, sans-serif" font-size="15" fill="#AAAAAA" text-anchor="middle">Gold Member</text>

  <!-- Customer name label -->
  <text x="660" y="175" font-family="Arial, sans-serif" font-size="17" fill="#888888" text-anchor="middle">اسم العميل</text>
  <!-- Customer name value -->
  <text x="660" y="225" font-family="Arial, sans-serif" font-size="36" font-weight="bold" fill="#FFFFFF" text-anchor="middle">${clientName}</text>

  <!-- Thin separator -->
  <line x1="290" y1="250" x2="1080" y2="250" stroke="#2A2A2A" stroke-width="1"/>

  <!-- Product code box -->
  <text x="460" y="278" font-family="Arial, sans-serif" font-size="14" fill="#888888" text-anchor="middle">كود خلطة الملوك</text>
  <rect x="300" y="290" width="320" height="58" fill="#1A1A1A" rx="8" stroke="#C9A84C" stroke-width="1.5"/>
  <text x="460" y="326" font-family="Arial, sans-serif" font-size="24" font-weight="bold" fill="#C9A84C" text-anchor="middle">${kingCode}</text>

  <!-- Storewide code box -->
  <text x="845" y="278" font-family="Arial, sans-serif" font-size="14" fill="#888888" text-anchor="middle">كود باقي المنتجات</text>
  <rect x="695" y="290" width="320" height="58" fill="#1A1A1A" rx="8" stroke="#C9A84C" stroke-width="1.5"/>
  <text x="855" y="326" font-family="Arial, sans-serif" font-size="24" font-weight="bold" fill="#C9A84C" text-anchor="middle">${otherCode}</text>

  <!-- Bottom bar -->
  <rect x="14" y="476" width="1097" height="110" fill="#1A1A1A" rx="10"/>
  <rect x="14" y="476" width="1097" height="30" fill="#1A1A1A"/>

  <!-- Bottom message (Arabic) -->
  <text x="562" y="522" font-family="Arial, sans-serif" font-size="22" font-weight="bold" fill="#C9A84C" text-anchor="middle">نشكرك لإنضمامك لعضوية الولاء الذهبية</text>
  <text x="562" y="560" font-family="Arial, sans-serif" font-size="15" fill="#777777" text-anchor="middle">عضوية الولاء الذهبية — مناحل الثنيان</text>
</svg>
`;

  // Render to PNG buffer
  const pngBuffer = await sharp(Buffer.from(svgCard)).png().toBuffer();

  // Embed PNG into PDF
  const pdfDoc = await PDFDocument.create();
  const pngImage = await pdfDoc.embedPng(pngBuffer);
  const pngDims = pngImage.scale(1);

  const page = pdfDoc.addPage([pngDims.width, pngDims.height]);
  page.drawImage(pngImage, {
    x: 0,
    y: 0,
    width: pngDims.width,
    height: pngDims.height
  });

  const pdfBytes = await pdfDoc.save();
  await fs.writeFile(outputPath, pdfBytes);

  // Return the public URL for the PDF
  const appUrl = process.env.SHOPIFY_APP_URL || '';
  return `${appUrl}/cards/${orderId}.pdf`;
}
