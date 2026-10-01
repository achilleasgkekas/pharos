/** Shared output contract for the built-in prompts (#364/#366). Proper names, merchant names,
 * URLs, codes and explicitly raw printed text remain unchanged; explanatory/free-text fields are
 * English so records stay consistent across deployments and source-document languages. */
export const ENGLISH_OUTPUT_RULE =
  'Language: write every descriptive/free-text output field in English. Preserve proper names, merchant and product brand names, URLs, codes, and fields explicitly described as raw printed text.';
