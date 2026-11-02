import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { extractResourceText } from '../scripts/extract-resource.js';

let directory = '';
beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'eduquest-pdf-'));
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

it('extracts actual PDF text through the worker helper instead of placeholder material', async () => {
  const file = path.join(directory, 'lecture with spaces.pdf');
  execFileSync('python', [
    '-c',
    `
import sys
from pypdf import PdfWriter
from pypdf.generic import DictionaryObject, NameObject, DecodedStreamObject
w=PdfWriter()
p=w.add_blank_page(width=600,height=800)
font=DictionaryObject({NameObject('/Type'):NameObject('/Font'),NameObject('/Subtype'):NameObject('/Type1'),NameObject('/BaseFont'):NameObject('/Helvetica')})
p[NameObject('/Resources')]=DictionaryObject({NameObject('/Font'):DictionaryObject({NameObject('/F1'):font})})
stream=DecodedStreamObject()
stream.set_data(b'BT /F1 12 Tf 50 700 Td (Mobile applications use activities and user interfaces.) Tj ET')
p[NameObject('/Contents')]=w._add_object(stream)
w.write(sys.argv[1])
`,
    file,
  ]);
  const text = await extractResourceText({
    resource_type: 'pdf',
    file_location: file,
  });
  expect(text).toContain(
    'Mobile applications use activities and user interfaces.',
  );
  expect(text).not.toContain('Uploaded educational material.');
});

it('rejects a corrupt PDF with a safe error without echoing its contents', async () => {
  const file = path.join(directory, 'broken.pdf');
  await writeFile(file, 'private document content');
  await expect(
    extractResourceText({ resource_type: 'pdf', file_location: file }),
  ).rejects.toThrow('DOCUMENT_EXTRACTION_FAILED');
});

it('keeps text documents intact and refuses empty or unsupported documents', async () => {
  const file = path.join(directory, 'notes.txt');
  await writeFile(file, 'A primary key identifies a row.');
  expect(
    await extractResourceText({ resource_type: 'txt', file_location: file }),
  ).toBe('A primary key identifies a row.');
  await writeFile(file, '  ');
  await expect(
    extractResourceText({ resource_type: 'txt', file_location: file }),
  ).rejects.toThrow('DOCUMENT_HAS_NO_TEXT');
  await expect(
    extractResourceText({ resource_type: 'docx', file_location: file }),
  ).rejects.toThrow('DOCUMENT_TYPE_NOT_SUPPORTED');
});
