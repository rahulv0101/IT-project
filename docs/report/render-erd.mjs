import { readFile, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const markdown = await readFile('docs/report/ERD.md', 'utf8');
const block = markdown.match(/```mermaid\n([\s\S]*?)\n```/)?.[1];
if (!block) throw new Error('Mermaid ERD block not found');

const entities = [];
for (const match of block.matchAll(
  /^ {2}([A-Z][A-Z0-9_]*) \{([\s\S]*?)^ {2}\}/gm,
)) {
  const fields = [
    ...match[2].matchAll(/^ {4}(\S+) (\S+)(?: "([^"]+)")?$/gm),
  ].map((field) => ({
    type: field[1].replaceAll('_', ' '),
    name: field[2],
    key: field[3] || '',
  }));
  entities.push({ name: match[1], fields });
}
const relations = [
  ...block.matchAll(
    /^ {2}([A-Z][A-Z0-9_]*) (\|\||\}o|\}\||o\|)--(\|\||\}o|\}\||o\|) ([A-Z][A-Z0-9_]*) : "([^"]+)"$/gm,
  ),
].map((match) => ({
  from: match[1],
  to: match[4],
  label: match[5],
}));

const width = 3600;
const cardWidth = 520;
const gapX = 180;
const gapY = 100;
const columns = 5;
const titleHeight = 100;
const rowHeights = entities.map((entity) => 78 + entity.fields.length * 28);
const maxCardHeight = Math.max(...rowHeights);
const rows = Math.ceil(entities.length / columns);
const height = titleHeight + rows * (maxCardHeight + gapY) + 80;
const positions = new Map();
const esc = (value) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

for (let i = 0; i < entities.length; i += 1) {
  const col = i % columns;
  const row = Math.floor(i / columns);
  positions.set(entities[i].name, {
    x: 60 + col * (cardWidth + gapX),
    y: titleHeight + 20 + row * (maxCardHeight + gapY),
    height: rowHeights[i],
  });
}

const svg = [
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
  '<rect width="100%" height="100%" fill="#ffffff"/>',
  '<style>text{font-family:Arial,sans-serif}.title{font-size:34px;font-weight:700;fill:#14213D}.entity{fill:#F6F4EF;stroke:#3B4BDB;stroke-width:3}.entity-name{font-size:20px;font-weight:700;fill:#14213D}.field{font-size:14px;fill:#333}.key{font-size:12px;font-weight:700;fill:#3B4BDB}.edge{stroke:#6f7890;stroke-width:1.5;opacity:.5}</style>',
  `<text class="title" x="60" y="58">EduQuest Final Database ERD · ${entities.length} tables · ${relations.length} foreign keys</text>`,
];
for (const relation of relations) {
  const from = positions.get(relation.from);
  const to = positions.get(relation.to);
  if (!from || !to) continue;
  const x1 = from.x + cardWidth / 2;
  const y1 = from.y + from.height / 2;
  const x2 = to.x + cardWidth / 2;
  const y2 = to.y + to.height / 2;
  svg.push(`<line class="edge" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`);
}
for (const entity of entities) {
  const p = positions.get(entity.name);
  svg.push(
    `<g><rect class="entity" x="${p.x}" y="${p.y}" width="${cardWidth}" height="${p.height}" rx="12"/>`,
  );
  svg.push(
    `<text class="entity-name" x="${p.x + 18}" y="${p.y + 30}">${esc(entity.name)}</text>`,
  );
  entity.fields.forEach((field, index) => {
    const y = p.y + 56 + index * 28;
    svg.push(
      `<text class="field" x="${p.x + 18}" y="${y}">${esc(field.type)}  ${esc(field.name)}</text>`,
    );
    if (field.key)
      svg.push(
        `<text class="key" x="${p.x + cardWidth - 72}" y="${y}">${esc(field.key)}</text>`,
      );
  });
  svg.push('</g>');
}
svg.push('</svg>');
const markup = svg.join('');
await writeFile('docs/report/erd.svg', markup, 'utf8');

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width, height, deviceScaleFactor: 1 },
});
await page.setContent(`<html><body style="margin:0">${markup}</body></html>`);
await page.screenshot({ path: 'docs/report/erd.png', fullPage: true });
await browser.close();
console.log(
  JSON.stringify({
    width,
    height,
    entities: entities.length,
    relationships: relations.length,
  }),
);
