import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';

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

  const templatePath = path.join(publicDir, 'Template_New.png');
  const outputPath = path.join(cardsDir, `${orderId}.png`);

  // We construct an SVG with exactly the same dimensions as the new image (941x1672)
  // and use text-anchor: middle to perfectly center text at the given X,Y coordinates.
  const svgOverlay = `
    <svg width="941" height="1672" xmlns="http://www.w3.org/2000/svg">
      <style>
        .name-text {
          font-family: Arial, sans-serif;
          font-size: 40px;
          font-weight: bold;
          fill: #FFFFFF;
        }
        .code-text {
          font-family: Arial, sans-serif;
          font-size: 34px;
          font-weight: bold;
          fill: #FFFFFF;
        }
      </style>
      <text x="466" y="880" class="name-text" text-anchor="middle" dominant-baseline="middle">${clientName}</text>
      <text x="460" y="1133" class="code-text" text-anchor="middle" dominant-baseline="middle">${kingCode}</text>
      <text x="452" y="1324" class="code-text" text-anchor="middle" dominant-baseline="middle">${otherCode}</text>
    </svg>
  `;

  await sharp(templatePath)
    .composite([
      {
        input: Buffer.from(svgOverlay),
        top: 0,
        left: 0,
      },
    ])
    .toFile(outputPath);

  // Return the public URL for the image
  const appUrl = process.env.SHOPIFY_APP_URL || '';
  return `${appUrl}/cards/${orderId}.png`;
}
