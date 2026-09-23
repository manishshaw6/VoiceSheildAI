/** Convert SQLite-style positional parameters to PostgreSQL parameters.
 * Question marks inside quoted SQL literals/identifiers are preserved.
 */
export function toPostgresPlaceholders(statement) {
  let result = '';
  let parameterIndex = 1;
  let inSingleQuote = false;
  let inDoubleQuote = false;

  for (let index = 0; index < statement.length; index += 1) {
    const character = statement[index];
    const previous = statement[index - 1];
    if (character === "'" && previous !== '\\' && !inDoubleQuote) inSingleQuote = !inSingleQuote;
    if (character === '"' && previous !== '\\' && !inSingleQuote) inDoubleQuote = !inDoubleQuote;
    if (character === '?' && !inSingleQuote && !inDoubleQuote) {
      result += `$${parameterIndex}`;
      parameterIndex += 1;
    } else {
      result += character;
    }
  }

  return result;
}
