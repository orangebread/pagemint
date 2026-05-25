import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  githubIssuesUrl,
  githubRepositoryUrl,
  localOnlyBoundarySummary,
  localOnlyDataSummary,
  publicSupportSummary
} from '../../apps/site/lib/site-policy.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function readText(relativePath: string): string {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function fromB64(value: string): string {
  return Buffer.from(value, 'base64').toString('utf8');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function fragmentPattern(value: string, flags = 'iu'): RegExp {
  return new RegExp(escapeRegExp(value), flags);
}

test('site policy points public support and source links at the GitHub repository', () => {
  assert.equal(githubRepositoryUrl, 'https://github.com/orangebread/pagemint');
  assert.equal(githubIssuesUrl, 'https://github.com/orangebread/pagemint/issues');
  assert.match(publicSupportSummary, /public GitHub issue tracker/i);
  assert.match(localOnlyBoundarySummary, /no hosted rendering, no telemetry, no account system, and no private support desk/i);
  assert.match(localOnlyDataSummary, /stay in the browser profile/i);
});

test('old offer routes are fully removed from the site', () => {
  for (const removedRoute of [
    fromB64('YXBwcy9zaXRlL2FwcC9wcmljaW5n'),
    fromB64('YXBwcy9zaXRlL2FwcC9jaGVja291dA==')
  ]) {
    assert.equal(fs.existsSync(path.join(root, removedRoute)), false, `${removedRoute} should not exist`);
  }
});

test('public policy pages contain no old offer or provider copy', () => {
  const source = [
    'apps/site/app/page.tsx',
    'apps/site/app/privacy/page.tsx',
    'apps/site/app/support/page.tsx',
    'apps/site/app/terms/page.tsx',
    'apps/site/app/trust/page.tsx'
  ].map(readText).join('\n');

  assert.match(source, /open source|MIT license/i);
  assert.match(source, /GitHub issues|GitHub issue tracker/i);
  for (const value of [
    fromB64('c3VwcG9ydEA='),
    fromB64('U3RyaXBl'),
    fromB64('U3VwYWJhc2U='),
    fromB64('UmVzZW5k'),
    fromB64('UG9zdGdyZXM='),
    fromB64('cGFpZCB0aWVy'),
    fromB64('bGljZW5zZSByZWZyZXNo'),
    fromB64('cHJpY2luZw=='),
    fromB64('c3Vic2NyaXB0aW9u'),
    fromB64('L2FwaS9iaWxsaW5n'),
    fromB64('L2FwaS9zdXBwb3J0')
  ]) {
    assert.doesNotMatch(source, fragmentPattern(value));
  }
  assert.doesNotMatch(source, new RegExp(escapeRegExp(fromB64('QnV5IFBybw==')), 'u'));
  assert.doesNotMatch(source, new RegExp(`href=["']${escapeRegExp(fromB64('L3ByaWNpbmc='))}["']`, 'u'));
});

test('site navigation no longer links to removed offer routes', () => {
  const policy = readText('apps/site/lib/site-policy.ts');
  assert.doesNotMatch(policy, new RegExp(`['"]${escapeRegExp(fromB64('L3ByaWNpbmc='))}['"]`, 'u'));
  assert.doesNotMatch(policy, new RegExp(escapeRegExp(fromB64('Y2hlY2tvdXQvc3VjY2Vzcw==')), 'u'));
});
