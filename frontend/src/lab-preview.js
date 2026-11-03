// The bridge must parse independently of student JavaScript, including syntax errors.
export function labSrcDoc(html, css, js, checks = []) {
  const safeChecks = JSON.stringify(checks).replace(/</g, '\\u003c');
  const safeJs = js.replace(/<\/script/gi, '<\\/script');
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:">
<script>
(() => {
  const send = (message) => parent.postMessage(message, '*');
  const safe = (value) => { try { return String(value); } catch (_) { return '[unprintable]'; } };
  const originalLog = console.log, originalError = console.error;
  console.log = (...args) => { send({ type: 'console', level: 'log', text: args.map(safe).join(' ') }); originalLog(...args); };
  console.error = (...args) => { send({ type: 'console', level: 'error', text: args.map(safe).join(' ') }); originalError(...args); };
  window.addEventListener('error', (event) => send({ type: 'console', level: 'error', text: 'JavaScript: ' + (event.message || 'Your script could not run.') }));
  window.addEventListener('unhandledrejection', (event) => send({ type: 'console', level: 'error', text: 'JavaScript: ' + safe(event.reason?.message || event.reason) }));
  const checks = ${safeChecks};
  const runChecks = () => checks.map((check) => { try {
    const node = check.selector ? document.querySelector(check.selector) : null;
    if (check.type === 'element_exists') return { passed: Boolean(node) };
    if (check.type === 'text_contains') return { passed: Boolean(node && node.textContent.includes(check.text)) };
    if (check.type === 'attribute_equals') return { passed: Boolean(node && node.getAttribute(check.attribute) === String(check.expected)) };
    if (check.type === 'computed_style_equals') return { passed: Boolean(node && getComputedStyle(node)[check.property] === String(check.expected)) };
    if (check.type === 'element_count') return { passed: document.querySelectorAll(check.selector).length === Number(check.expected) };
    if (check.type === 'function_returns') { const fn = window[check.functionName]; return { passed: typeof fn === 'function' && fn(...(check.args || [])) === check.expected }; }
    return { passed: false };
  } catch (_) { return { passed: false }; } });
  window.addEventListener('load', () => send({ type: 'checks', results: runChecks() }));
  const beat = () => send({ type: 'heartbeat' }); setInterval(beat, 500); beat();
})();</script><style>${css}</style></head><body>${html}<script>${safeJs}</script></body></html>`;
}
