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

  const templatePath = path.join(publicDir, 'Template.png');
  const outputPath = path.join(cardsDir, `${orderId}.png`);

  // We construct an SVG with exactly the same dimensions as the image (3000x5334)
  // and use text-anchor: middle to perfectly center text at the given X,Y coordinates.
  const svgOverlay = `
    <svg width="3000" height="5334" xmlns="http://www.w3.org/2000/svg">
      <style>
        .name-text {
          font-family: Arial, sans-serif;
          font-size: 130px;
          font-weight: bold;
          fill: #000000;
        }
        .code-text {
          font-family: Arial, sans-serif;
          font-size: 110px;
          font-weight: bold;
          fill: #000000;
        }
      </style>
      <text x="1513" y="2800" class="name-text" text-anchor="middle" dominant-baseline="middle">${clientName}</text>
      <text x="1509" y="3606" class="code-text" text-anchor="middle" dominant-baseline="middle">${kingCode}</text>
      <text x="1503" y="4222" class="code-text" text-anchor="middle" dominant-baseline="middle">${otherCode}</text>
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
