import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const svgPath = path.join(__dirname, 'public', 'icon.svg');

const svgBuffer = fs.readFileSync(svgPath);

async function generate() {
  await sharp(svgBuffer)
    .resize(192, 192)
    .png()
    .toFile(path.join(__dirname, 'public', 'pwa-192x192.png'));
    
  await sharp(svgBuffer)
    .resize(512, 512)
    .png()
    .toFile(path.join(__dirname, 'public', 'pwa-512x512.png'));
    
  await sharp(svgBuffer)
    .resize(180, 180)
    .png()
    .toFile(path.join(__dirname, 'public', 'apple-touch-icon.png'));

  console.log("Icons generated!");
}

generate().catch(console.error);
