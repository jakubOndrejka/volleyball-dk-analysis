import fs from 'node:fs/promises';
import path from 'node:path';
import { addLiberoTracking, LIBERO_TRACKING_VERSION } from './libero-events.js';
import { fetchBytes } from './results-source.js';
import { validateMatch } from '../analysis-engine.js';

/** Enrich already validated matches from HTML without waiting for PDF collection.
 * PDF retry dates and the 16-PDF batch limit do not govern this separate queue.
 */
export async function refreshLiberoHistory(entries, {
  analysisDir = 'data/analysis', cacheDir = '.cache/pdf',
  htmlByMatch = new Map(), only = null, offline = false, force = false,
  maxMatches = 100, concurrency = 3, now = new Date(),
  getHistory = async entry => (await fetchBytes(entry.matchUrl || entry.source.matchUrl)).toString('utf8'),
  log = console.log,
} = {}) {
  const result = { checked: 0, updated: 0, failed: 0, remaining: 0 };
  const jobs = [], seen = new Set();
  const stamp = now.toISOString(), retryAt = new Date(now.getTime() + 6 * 3600000).toISOString();
  for (const entry of entries) {
    if (entry.status !== 'ready' || !/^\d+$/.test(String(entry.id)) ||
        seen.has(String(entry.id)) || (only && String(entry.id) !== String(only))) continue;
    seen.add(String(entry.id));
    // A failed HTML refresh must not turn a valid PDF match into "review".
    if (!force && entry.liberoNextCheckAt && new Date(entry.liberoNextCheckAt) > now) continue;
    try {
      const file = path.join(analysisDir, 'matches', `${entry.id}.json`);
      const match = JSON.parse(await fs.readFile(file, 'utf8'));
      const tracking = match.liberoTracking;
      const current = tracking?.version === LIBERO_TRACKING_VERSION &&
        match.sets.every(set => set.rallies.every(r => r.libero?.home && r.libero?.away));
      const complete = current && ['home', 'away'].every(side => tracking.knownRallies[side] === tracking.totalRallies);
      if (!force && complete) continue;
      jobs.push({ entry, file, match, current });
    } catch (error) {
      entry.liberoRefreshWarning = `Libero refresh could not read the saved match: ${error.message}`;
      entry.liberoNextCheckAt = retryAt;
      result.failed++;
      log(`[libero ${entry.id}] ${entry.liberoRefreshWarning}`);
    }
  }
  // Previously unprocessed matches go first; incomplete source logs retry later.
  jobs.sort((a, b) => Number(a.current) - Number(b.current) || b.match.date.localeCompare(a.match.date));
  const limit = Number.isFinite(+maxMatches) ? Math.max(1, Math.floor(+maxMatches)) : 100;
  const selected = jobs.slice(0, limit);
  result.remaining = jobs.length - selected.length;
  let next = 0;
  const worker = async () => {
    while (next < selected.length) {
      const { entry, file, match } = selected[next++];
      result.checked++;
      try {
        const html = htmlByMatch.has(String(entry.id)) ? htmlByMatch.get(String(entry.id))
          : offline ? await fs.readFile(path.join(cacheDir, `${entry.id}.html`), 'utf8')
          : await getHistory(entry);
        validateMatch(match);
        addLiberoTracking(match, html);
        match.liberoTracking.checkedAt = stamp;
        await fs.writeFile(file + '.tmp', JSON.stringify(match) + '\n');
        await fs.rename(file + '.tmp', file);
        entry.liberoLastCheckedAt = stamp;
        entry.liberoVersion = LIBERO_TRACKING_VERSION;
        const full = ['home', 'away'].every(side =>
          match.liberoTracking.knownRallies[side] === match.liberoTracking.totalRallies);
        entry.liberoNextCheckAt = full ? null : retryAt;
        delete entry.liberoRefreshWarning;
        result.updated++;
        log(`[libero ${entry.id}] history refreshed; home ${match.liberoTracking.knownRallies.home}/${match.liberoTracking.totalRallies}, away ${match.liberoTracking.knownRallies.away}/${match.liberoTracking.totalRallies} rallies confirmed.`);
      } catch (error) {
        entry.liberoRefreshWarning = `Libero history refresh failed; saved match retained: ${error.message}`;
        entry.liberoNextCheckAt = retryAt;
        result.failed++;
        log(`[libero ${entry.id}] ${entry.liberoRefreshWarning}`);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(3, concurrency, selected.length || 1)) }, worker));
  log(`Libero history: ${result.updated} updated, ${result.failed} failed, ${result.remaining} waiting for a later batch.`);
  return result;
}
