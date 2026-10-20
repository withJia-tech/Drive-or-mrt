import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const agent = await readFile(new URL('../agent.js', import.meta.url), 'utf8');

describe('personal utility agent product boundary', () => {
  test('architecture commentary and agent controls stay off the task interface', () => {
    assert.doesNotMatch(html, /Start naturally|Tell me the trip|Comparison only/);
    assert.doesNotMatch(html, /id="agentForm"|class="agent-panel"/);
    assert.doesNotMatch(html, /<p class="deck">[^<]*(?:mobile-first|deterministic)/i);
    assert.doesNotMatch(html, /<span class="issue-tag[^>]*>Personal agent<\/span>/i);
  });

  test('the agent module has no network, storage or transaction capability', () => {
    assert.doesNotMatch(agent, /\bfetch\s*\(/);
    assert.doesNotMatch(agent, /localStorage|sessionStorage|indexedDB/);
    assert.doesNotMatch(agent, /https?:\/\//);
    assert.doesNotMatch(agent, /window\.open|location\.assign|postMessage/);
  });

  test('calculation stays in the deterministic module while agent skills remain isolated', () => {
    assert.doesNotMatch(agent, /from ['"]\.\/calc\.js['"]/);
    assert.match(html, /import \{ computeAll,[^}]+ \} from ['"]\.\/calc\.js['"]/);
  });

  test('parking and fare assumptions are reasoning layers, not landing-page sections', () => {
    assert.match(html, /<div class="card" id="card2" hidden>/);
    assert.match(html, /<div class="card" id="card3" hidden>/);
    assert.ok(html.indexOf('id="parkHours"') < html.indexOf('id="card2"'));
    assert.match(html, /id="editAssumptionsBtn"[^>]*>Edit assumptions<\/button>/);
    assert.match(html, /destinationTypeForPlace/);
  });

  test('an inference failure reveals the manual parking fallback', () => {
    assert.match(html, /inferredDestination\.rate === null/);
    assert.match(html, /\$\('card2'\)\.hidden = false/);
    assert.match(html, /could not infer a reliable parking rate/i);
  });
});

describe('mobile-first release boundary', () => {
  test('declares the device viewport and a narrow-screen layout', () => {
    assert.match(html, /name="viewport" content="width=device-width, initial-scale=1\.0"/);
    assert.match(html, /@media \(max-width: 380px\)/);
  });

  test('essential location and context actions meet the 44px touch minimum', () => {
    assert.match(html, /\.geo-btn\s*\{[^}]*min-height:\s*44px/s);
    assert.match(html, /\.chip\s*\{[^}]*min-height:\s*44px/s);
    assert.match(html, /\.edit-assumptions-btn\s*\{[^}]*min-height:\s*44px/s);
  });
});
