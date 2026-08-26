import fs from 'fs/promises';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';

async function run() {
  const pngPath = '/Volumes/Main/Codes/unique-discount-app/test-landscape-preview.png';
  const pngBytes = await fs.readFile(pngPath);
  
  const pdfDoc = await PDFDocument.create();
  const pngImage = await pdfDoc.embedPng(pngBytes);
  const pngDims = pngImage.scale(1);
  
  const page = pdfDoc.addPage([pngDims.width, pngDims.height]);
  page.drawImage(pngImage, {
    x: 0,
    y: 0,
    width: pngDims.width,
    height: pngDims.height
  });
  
  const pdfBytes = await pdfDoc.save();
  await fs.writeFile('/Volumes/Main/Codes/unique-discount-app/test-landscape-preview.pdf', pdfBytes);
  console.log('PDF saved');
}
run();
