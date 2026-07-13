// lib/first-inning-cache.ts

import { createCache } from './cache';
import { FirstInningPitcherStats, FirstInningBatterStats } from './types';

// Cache para estadísticas de pitcher del 1er inning (TTL 12 horas)
export const pitcherFirstInningCache = createCache<FirstInningPitcherStats>(12 * 60 * 60 * 1000);

// Cache para estadísticas de bateador del 1er inning (TTL 12 horas)
export const batterFirstInningCache = createCache<FirstInningBatterStats>(12 * 60 * 60 * 1000);