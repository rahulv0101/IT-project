import { readUpload } from '../src/file-storage.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { resolvePython } from '../../scripts/python-runtime.mjs';

const run = promisify(execFile);
const helper = fileURLToPath(
  new URL('../../ai-service/tools/extract_pdf.py', import.meta.url),
);

// Never replace an unreadable document with invented source material.
/** @param {{resource_type: string, file_location: string}} resource */
export async function extractResourceText(resource) {
  const extension = resource.resource_type.toLowerCase();
  let text;
  if (extension === 'txt' || extension === 'md') {
    text = (await readUpload(resource.file_location)).toString('utf8');
  } else if (extension === 'pdf' && process.env.AI_EXTRACT_URL) {
    const bytes = await readUpload(resource.file_location);
    const response = await fetch(process.env.AI_EXTRACT_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-ai-service-token': process.env.AI_SERVICE_TOKEN || '',
      },
      body: JSON.stringify({ content: bytes.toString('base64') }),
      signal: AbortSignal.timeout(120000),
    });
    if (!response.ok) throw new Error('DOCUMENT_EXTRACTION_FAILED');
    text = (await response.json()).text;
  } else if (extension === 'pdf') {
    try {
      const result = await run(
        resolvePython(),
        [helper, resource.file_location],
        {
          timeout: 120000,
          maxBuffer: 2 * 1024 * 1024,
          windowsHide: true,
          encoding: 'utf8',
        },
      );
      text = result.stdout;
    } catch {
      throw new Error('DOCUMENT_EXTRACTION_FAILED');
    }
  } else {
    throw new Error('DOCUMENT_TYPE_NOT_SUPPORTED');
  }
  if (!text.trim()) throw new Error('DOCUMENT_HAS_NO_TEXT');
  return text;
}
