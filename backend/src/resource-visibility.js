/**
 * SQL fragments accept only internal aliases and parameter placeholders.
 * @param {string} alias
 * @param {string} viewerParameter
 */
export function resourceYearScope(alias, viewerParameter) {
  if (!/^[a-z_]+$/.test(alias) || !/^\$[1-9][0-9]*$/.test(viewerParameter))
    throw new Error('Invalid resource visibility query configuration');
  return `(${alias}.target_year IS NULL OR ${alias}.target_year=(SELECT student_year FROM users WHERE user_id=${viewerParameter}))`;
}
