#!/usr/bin/env node
// Scrapes standings + full schedule from volleyball.dk and writes data/*.json.
// Run: node scraper.js  (requires Node 24+)

import * as cheerio from 'cheerio';
import { writeFileSync, readFileSync } from 'node:fs';
import { fetchBytes } from './lib/results-source.js';

const SETTINGS = JSON.parse(readFileSync('project-config.json','utf8'));
const PULJE_IDS = SETTINGS.leagueIds;
const BASE = 'https://resultater.volleyball.dk/tms/Turneringer-og-resultater';

const VENUE_ADDRESSES = {
  'Idrætshuset':      'Gunnar Nu Hansens Plads 7, 2100 København Ø',
  'Sundbyhal 1':      'Englandsvej 61, 2300 København S',
  'Sundbyhal 2':      'Englandsvej 61, 2300 København S',
  'Ny Holtehal':      'Kongevejen 464, 2840 Holte',
  'Kildeskovshal 1':  'Adolphsvej 25, 2820 Gentofte',
  'Lyngehallen':      'Idrætsvej 14, 3540 Lynge',
  'Engelsborghallen': 'Engelsborgvej 93, 2800 Kgs. Lyngby',
  'Kedelhallen':      'Nyelandsvej 75, 2000 Frederiksberg',
  'Bülowsvejhallen':  'Bülowsvej 34, 1870 Frederiksberg C',
  'Buddingehallen':   'Kildebakkegårds Alle 155, 2860 Søborg',
};

function mapsUrl(venue) {
  const addr = VENUE_ADDRESSES[venue];
  return addr ? `https://maps.google.com/maps?q=${encodeURIComponent(addr)}` : null;
}

// "27-09-26" → "2026-09-27"
function parseDate(raw) {
  const [d, m, y] = raw.trim().split('-');
  return `20${y}-${m}-${d}`;
}

async function fetchHtml(url) {
  return cheerio.load((await fetchBytes(url)).toString('utf8'));
}

async function scrapeStandings(puljeId) {
  const $ = await fetchHtml(`${BASE}/Pulje-Stilling.aspx?PuljeId=${puljeId}`);
  const teams = [];

  $('table.srPoolPosition tr.srOdd, table.srPoolPosition tr.srEven').each((_, row) => {
    const cell = cls => $(row).find(`td.${cls}`).text().trim();
    const name = $(row).find('td.c02 a').text().trim();
    if (!name) return;

    const setsWon  = parseInt(cell('c08')) || 0;
    const setsLost = parseInt(cell('c10')) || 0;

    teams.push({
      pos:  parseInt(cell('c01')) || teams.length + 1,
      name,
      k:    parseInt(cell('c04')) || 0,
      v:    parseInt(cell('c05')) || 0,
      t:    parseInt(cell('c07')) || 0,
      sets: (setsWon || setsLost) ? `${setsWon}-${setsLost}` : '—',
      pts:  parseInt(cell('c12')) || 0,
    });
  });

  return teams;
}

function normalizeScore(raw) {
  if (!raw) return null;

  const cleaned = raw
    .replace(/\u2013|\u2014/g, '-')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return null;

  const match = cleaned.match(/^(\d{1,2})\s*[-:]\s*(\d{1,2})(?:\s*\(.+\))?$/);
  if (!match) return null;

  return `${match[1]}-${match[2]}`;
}

async function scrapeFixtures(puljeId) {
  const $ = await fetchHtml(`${BASE}/Pulje-Komplet-Kampprogram.aspx?PuljeId=${puljeId}`);
  const fixtures = [];

  $('tr.srOdd, tr.srEven').each((_, row) => {
    const $row = $(row);
    const cell = cls => $row.find(`td.${cls}`);

    // Date cell contains "DD-MM-YY\nkl. HH:MM"
    const dateText = cell('c02').text().replace(/kl\.\s*/g, '').trim();
    const parts    = dateText.split(/\s+/).filter(Boolean);
    if (parts.length < 2) return;

    const home  = cell('c03').find('a').text().trim();
    const away  = cell('c04').find('a').text().trim();
    if (!home || !away) return;

    const venue   = cell('c05').find('a').text().trim();
    const resultRaw = cell('c06').text().trim();
    const score   = normalizeScore(resultRaw);

    fixtures.push({
      matchId: new URL(cell('c01').find('a').attr('href') || '', BASE).searchParams.get('KampId'),
      matchNumber: cell('c01').find('a').text().trim(),
      matchUrl: new URL(cell('c01').find('a').attr('href') || '', BASE).href,
      date:    parseDate(parts[0]),
      time:    parts[1],
      home,
      away,
      venue,
      mapsUrl: mapsUrl(venue),
      score,
      completed: !!score && Math.max(...score.split('-').map(Number)) === (SETTINGS.bestOfThreeLeagueIds?.includes(puljeId) ? 2 : 3),
    });
  });

  return fixtures;
}

async function scrapeLeague(puljeId) {
  console.log(`\n[${puljeId}] Fetching standings...`);
  const teams = await scrapeStandings(puljeId);
  console.log(`  → ${teams.length} teams`);

  console.log(`[${puljeId}] Fetching fixtures...`);
  const fixtures = await scrapeFixtures(puljeId);
  console.log(`  → ${fixtures.length} fixtures`);

  if (!teams.length || !fixtures.length) {
    console.error(`  ✗ Empty data for ${puljeId} — skipping to avoid overwriting good data.`);
    return;
  }

  const data = { updatedAt: new Date().toISOString(), teams, fixtures };
  const file = `data/data-${puljeId}.json`;
  let prior; try { prior = JSON.parse(readFileSync(file,'utf8')); } catch {}
  if (prior && JSON.stringify(prior.teams) === JSON.stringify(teams) && JSON.stringify(prior.fixtures) === JSON.stringify(fixtures)) return;
  writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf8');
  console.log(`  ✓ ${file} written`);
}

async function main() {
  let failures = 0;
  const queue = [...PULJE_IDS];
  await Promise.all(Array.from({length:2}, async () => {
    while(queue.length) { const id=queue.shift(); try { await scrapeLeague(id); } catch(error) { failures++; console.error(`[${id}] ${error.message}`); } }
  }));
  if(failures===PULJE_IDS.length) throw new Error('All league refreshes failed; existing data preserved.');
  console.log('\nDone.');
}

main().catch(err => { console.error(err.message); process.exit(1); });
