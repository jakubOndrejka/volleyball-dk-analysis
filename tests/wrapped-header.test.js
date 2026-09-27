import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {parseRoster, parseScorecard, PARSER_VERSION} from '../lib/pdf-parser.js';
import {validateMatch} from '../analysis-engine.js';

test('real five-set PDF with a wrapped team header retains exact fixture matching',async()=>{
  const fixture={matchId:'76261',leagueId:4128,home:'KV 61',away:'Lyngby-Gladsaxe Volley',score:'2-3',date:'2026-09-27',matchNumber:'149023'};
  const roster=await parseRoster(await fs.readFile(new URL('fixtures/76261-roster.pdf',import.meta.url)),fixture);
  const scorecard=await fs.readFile(new URL('fixtures/76261-scorecard.pdf',import.meta.url));
  const match=await parseScorecard(scorecard,fixture,roster);
  assert.deepEqual(match.sets.map(set=>set.score),[[21,25],[25,23],[26,24],[19,25],[15,17]]);
  assert.deepEqual(match.sets.map(set=>set.rallies.length),[46,48,50,44,32]);
  assert.equal(validateMatch(match),true);
  assert.equal(match.parserVersion,PARSER_VERSION);
  await assert.rejects(parseScorecard(scorecard,{...fixture,away:'Different team'},roster),/headers/);
});
