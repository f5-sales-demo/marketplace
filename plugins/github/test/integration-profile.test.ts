import { describe, expect, it, spyOn } from 'bun:test';
import { githubEmailProfile, githubUserProfile, githubVerifiedEmails, probeGitHubUser } from '../src/index';

const spawnResult = (exitCode: number, stdout = '', stderr = '') =>
  ({ exitCode, stdout: Buffer.from(stdout), stderr: Buffer.from(stderr) }) as ReturnType<typeof Bun.spawnSync>;

describe('GitHub person-profile contributions', () => {
  it('maps a user to schema-shaped account and identity facts without extra data', () => {
    expect(
      githubUserProfile({
        id: 4242,
        login: 'fixture-admin',
        html_url: 'https://github.com/fixture-admin',
        type: 'User',
      }),
    ).toEqual({
      facts: {
        accounts: [{ provider: 'github', identifier: '4242', principalType: 'user', username: 'fixture-admin' }],
        identifiers: { github: 'fixture-admin' },
        sameAs: ['https://github.com/fixture-admin'],
      },
      observations: [],
    });
  });

  it('does not promote service principals into person identifiers', () => {
    expect(githubUserProfile({ id: 84, login: 'fixture-bot', type: 'Bot' })).toEqual({
      facts: {
        accounts: [{ provider: 'github', identifier: '84', principalType: 'service', username: 'fixture-bot' }],
      },
      observations: [],
    });
  });

  it('normalizes and deduplicates verified email contributions', () => {
    expect(githubEmailProfile([' admin@example.com ', 'admin@example.com', 'ops@example.com'])).toEqual({
      facts: { email: ['admin@example.com', 'ops@example.com'] },
      observations: [],
    });
  });

  it('collects only verified non-empty email addresses from paginated GitHub responses', () => {
    expect(
      githubVerifiedEmails([
        [
          { email: 'verified@example.com', verified: true },
          { email: 'unverified@example.com', verified: false },
          { email: '', verified: true },
        ],
        [{ email: 'second@example.com', verified: true }],
      ]),
    ).toEqual(['verified@example.com', 'second@example.com']);
  });

  it('repeats ready checks without invoking installation or login commands', () => {
    const calls: string[][] = [];
    const spawn = spyOn(Bun, 'spawnSync').mockImplementation((argv) => {
      const command = [...argv] as string[];
      calls.push(command);
      if (command[0] === 'which') return spawnResult(0);
      return spawnResult(0, JSON.stringify({ id: 4242, login: 'fixture-admin', type: 'User' }));
    });
    try {
      expect(probeGitHubUser()).toMatchObject({ state: 'ready' });
      expect(probeGitHubUser()).toMatchObject({ state: 'ready' });
      expect(calls).toEqual([
        ['which', 'gh'],
        ['gh', 'api', 'user'],
        ['which', 'gh'],
        ['gh', 'api', 'user'],
      ]);
    } finally {
      spawn.mockRestore();
    }
  });

  it('returns normalized retry timing from a rate-limited readiness check', () => {
    const spawn = spyOn(Bun, 'spawnSync')
      .mockReturnValueOnce(spawnResult(0))
      .mockReturnValueOnce(spawnResult(1, '', 'HTTP 429\nretry-after: 2'));
    try {
      expect(probeGitHubUser()).toEqual({ state: 'rate_limited', reason: 'rate_limited', retryAfterMs: 2000 });
    } finally {
      spawn.mockRestore();
    }
  });
});
