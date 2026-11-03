import { HtmlValidate } from 'html-validate/browser';

const validator = new HtmlValidate({
  extends: [],
  elements: ['html5'],
  rules: {
    'close-order': 'error',
    'element-permitted-content': 'error',
    'element-permitted-parent': 'error',
    'no-dup-attr': 'error',
  },
});

// Browsers repair malformed markup. Validate the source before rendering it.
export function validateLabHtml(html) {
  const report = validator.validateStringSync(html);
  return report.results.flatMap((result) =>
    result.messages.slice(0, 20).map((message) => ({
      type: 'console',
      level: 'error',
      text: `HTML line ${message.line}, column ${message.column}: ${
        message.ruleId === 'parser-error'
          ? 'Invalid HTML syntax. Check tag brackets, quotes and document structure.'
          : message.message
      }`,
    })),
  );
}
