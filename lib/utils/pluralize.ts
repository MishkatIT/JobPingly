/**
 * Formats a count with a singular or plural noun.
 * Example:
 *   pluralize(1, 'Company', 'Companies') => "1 Company"
 *   pluralize(2, 'Company', 'Companies') => "2 Companies"
 *   pluralize(0, 'Company', 'Companies') => "0 Companies"
 */
export function pluralize(count: number, singular: string, plural?: string): string {
  const pluralForm = plural || `${singular}s`;
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

/**
 * Returns just the singular or plural noun without the number prefix.
 * Example:
 *   pluralizeNoun(1, 'Company', 'Companies') => "Company"
 *   pluralizeNoun(2, 'Company', 'Companies') => "Companies"
 */
export function pluralizeNoun(count: number, singular: string, plural?: string): string {
  const pluralForm = plural || `${singular}s`;
  return count === 1 ? singular : pluralForm;
}
