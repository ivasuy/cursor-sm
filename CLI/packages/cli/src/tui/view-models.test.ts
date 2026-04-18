import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCommandDeck, buildProvidersModule } from './view-models.js';

test('buildCommandDeck produces balanced overview cards from report payload', () => {
  const deck = buildCommandDeck({
    fetchedAt: 1,
    range: { since: 1, until: 2 },
    providers: [],
    repos: [{ repoId: 1, name: 'cursor-sm', path: '/repo', perProvider: [] }],
    worktrees: [],
    features: [],
    files: [],
    pace: [],
  });

  assert.equal(deck.cards[0].label, 'tracked repos');
  assert.equal(deck.cards[0].value, '1');
  assert.equal(deck.highlights[0], '0 live provider surfaces');
});

test('buildProvidersModule exposes rich provider metrics instead of raw JSON', () => {
  const moduleView = buildProvidersModule([
    {
      descriptor: {
        id: 'claude',
        metadata: {
          displayName: 'Claude Code',
          vendor: 'Anthropic',
          category: 'assistant',
          website: '',
        },
        branding: { icon: 'X', accentColor: '#00ff00' },
      },
      snapshot: {
        weekly: {
          used: 74,
          cap: 100,
          unit: '%',
          resetsAt: 1_716_000_000_000,
          label: 'weekly',
        },
        inputTokens: 1_000_000,
        outputTokens: 500_000,
        sessionCount: 12,
        cost: {
          today: 4.2,
          last30d: 83.5,
          totalTokens: 1_500_000,
          todayTokens: 120_000,
        },
        modelBreakdown: [
          { model: 'opus-4.1', tokens: 800_000, costUSD: 61.2 },
          { model: 'sonnet-4', tokens: 700_000, costUSD: 22.3 },
        ],
        updatedAt: 1_716_000_000_000,
        identity: {
          plan: 'max 20x',
          email: 'vasu@example.com',
        },
      },
      status: 'live',
    },
  ]);

  assert.equal(moduleView.rows[0].title, 'Claude Code');
  assert.equal(moduleView.rows[0].stats[0], 'max 20x');
  assert.equal(moduleView.rows[0].bars[0].label, 'weekly');
  assert.match(moduleView.rows[0].bars[0].valueText, /74\/100/);
  assert.match(moduleView.rows[0].details.join('\n'), /1\.5M total tokens/);
  assert.match(moduleView.rows[0].details.join('\n'), /opus-4.1/);
});
