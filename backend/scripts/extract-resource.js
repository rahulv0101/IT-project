import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

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
    text = await readFile(resource.file_location, 'utf8');
  } else if (extension === 'pdf') {
    try {
      const result = await run(
        process.env.PYTHON_EXECUTABLE || 'python',
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
