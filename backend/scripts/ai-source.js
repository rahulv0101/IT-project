/** Select bounded excerpts across a long document, including its middle.
 * @param {string} text
 */
export function selectSourceText(text, limit = 6000) {
  if (!Number.isInteger(limit) || limit < 300)
    throw new Error('Invalid source limit');
  if (text.length <= limit) return text;
  const separator = '\n\n';
  const width = Math.floor((limit - separator.length * 2) / 3);
  return [0.2, 0.5, 0.8]
    .map((position) => {
      const start = Math.floor((text.length - width) * position);
      const excerpt = text.slice(start, start + width);
      // Avoid beginning inside a word while retaining an actual source passage.
      const boundary = excerpt.search(/\s/);
      return boundary >= 0 && boundary < 40
        ? excerpt.slice(boundary + 1)
        : excerpt;
    })
    .join(separator);
}
