// Map registry. To add a map: create a file like kiln.js that exports a built map, then add it here.
import range from './range.js';
import kiln from './kiln.js';

export const MAPS = { range, kiln };

/** Maps offered in the lobby (the practice range is offline only). */
export const MATCH_MAPS = ['kiln'];
