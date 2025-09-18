// scripts/replace-unsplash-with-official.mjs
// Run: node --input-type=module scripts/replace-unsplash-with-official.mjs

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'fs/promises';
import path from 'path';

const execFileAsync = promisify(execFile);

const DATA_PATH = './scripts/data.js';
const { DEFAULT_TRIP_TEMPLATE } = await import(path.resolve(DATA_PATH));

const items = [
  ...(DEFAULT_TRIP_TEMPLATE.catalog?.activity || []),
  ...(DEFAULT_TRIP_TEMPLATE.catalog?.stay || []),
];

const replacements = [];

for (const item of items) {
  try {
    if (!item?.image) continue;
    if (!/images\.unsplash\.com|wikimedia\.org/i.test(item.image)) continue;

    if (!item.url) {
      console.error(`[skip] ${item.id} has no url.`);
      continue;
    }

    console.log(`Processing ${item.id}: ${item.url}`);

    const curlArgs = [
      '-sL',
      '--http1.1',
      '--max-time',
      '20',
      '-H',
      'User-Agent: Mozilla/5.0',
      item.url,
    ];

    const { stdout } = await execFileAsync('curl', curlArgs, { maxBuffer: 20 * 1024 * 1024 });
    const html = stdout.toString();

    let match =
      html.match(/<meta[^>]+(?:property|name)=["']og:image["'][^>]*content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']og:image["']/i) ||
      html.match(/<meta[^>]+(?:name|property)=["']twitter:image["'][^>]*content=["']([^"']+)["']/i) ||
      html.match(/<img[^>]+src=["']([^"']+\.(?:jpg|jpeg|png|webp|svg))["']/i);

    if (!match) {
      console.error(`  → No image tag found. Manual review needed.`);
      continue;
    }

    let imageUrl = match[1];
    imageUrl = imageUrl.replace(/&amp;/g, '&');
    if (imageUrl.startsWith('//')) {
      imageUrl = 'https:' + imageUrl;
    }
    if (!/^https?:\/\//i.test(imageUrl)) {
      try {
        imageUrl = new URL(imageUrl, item.url).href;
      } catch (error) {
        console.error(`  → Could not resolve relative URL for ${item.id}.`);
        continue;
      }
    }

    replacements.push({ id: item.id, oldUrl: item.image, newUrl: imageUrl });
    console.log(`  → Found ${imageUrl}`);
  } catch (error) {
    console.error(`Error while processing ${item?.id}: ${error.message}`);
  }
}

if (replacements.length === 0) {
  console.log('No replacements found.');
  process.exit(0);
}

await fs.copyFile(DATA_PATH, DATA_PATH + '.bak');
let dataText = await fs.readFile(DATA_PATH, 'utf8');

for (const { oldUrl, newUrl, id } of replacements) {
  const escaped = oldUrl.replace(/([.*+?^=!:${}()|[\]\\])/g, '\\$1');
  const regex = new RegExp("(['\"`])" + escaped + "\\1", 'g');
  if (!regex.test(dataText)) {
    console.warn(`  ✖ Could not locate ${oldUrl} in source.`);
    continue;
  }
  dataText = dataText.replace(regex, `'${newUrl}'`);
  console.log(`Replaced ${id}`);
}

await fs.writeFile(DATA_PATH, dataText, 'utf8');

console.log('\nDone. Created backup at scripts/data.js.bak');
