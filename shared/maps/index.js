// Map registry. To add a map: create a file like kiln.js that exports a built map, then add it here.
import range from './range.js';
import kiln from './kiln.js';
import dockyard from './dockyard.js';
import overpass from './overpass.js';

export const MAPS = { range, kiln, dockyard, overpass };

/** Maps offered in the lobby (the practice range is offline only). */
export const MATCH_MAPS = ['kiln', 'dockyard', 'overpass'];
