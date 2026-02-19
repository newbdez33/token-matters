import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { gitPull, gitAddCommitPush } from '../../src/git.js';

// Mock execFile
vi.mock('node:child_process', () => ({
  execFile: vi.fn((_cmd: string, _args: string[], _opts: unknown, cb: Function) => {
    cb(null, '', '');
  }),
}));

import { execFile } from 'node:child_process';

const mockedExecFile = vi.mocked(execFile);

describe('gitPull', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('runs git pull --rebase in the repo directory', async () => {
    await gitPull('/tmp/repo');
    expect(mockedExecFile).toHaveBeenCalledWith(
      'git',
      ['pull', '--rebase'],
      { cwd: '/tmp/repo' },
      expect.any(Function),
    );
  });

  it('skips in dryRun mode', async () => {
    await gitPull('/tmp/repo', true);
    expect(mockedExecFile).not.toHaveBeenCalled();
  });
});

describe('gitAddCommitPush', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs git add, commit, and push', async () => {
    const promise = gitAddCommitPush('/tmp/repo', ['raw/file.json'], 'test commit');
    await vi.runAllTimersAsync();
    await promise;
    const calls = mockedExecFile.mock.calls;
    expect(calls).toHaveLength(3);
    // add
    expect(calls[0][0]).toBe('git');
    expect(calls[0][1]).toContain('add');
    // commit
    expect(calls[1][1]).toContain('commit');
    // push
    expect(calls[2][1]).toContain('push');
  });

  it('skips in dryRun mode', async () => {
    const promise = gitAddCommitPush('/tmp/repo', ['raw/file.json'], 'test', true);
    await vi.runAllTimersAsync();
    await promise;
    expect(mockedExecFile).not.toHaveBeenCalled();
  });

  it('retries push on failure up to 3 times', async () => {
    let pushCount = 0;
    mockedExecFile.mockImplementation((_cmd, args, _opts, cb) => {
      const argArray = args as string[];
      if (argArray.includes('push')) {
        pushCount++;
        if (pushCount < 3) {
          (cb as Function)(new Error('push failed'), '', '');
          return undefined as never;
        }
      }
      (cb as Function)(null, '', '');
      return undefined as never;
    });

    const promise = gitAddCommitPush('/tmp/repo', ['raw/file.json'], 'test');
    // Advance timers to resolve retry delays
    await vi.runAllTimersAsync();
    await promise;
    expect(pushCount).toBe(3);
  });

  it('skips commit and push if no files to add', async () => {
    const promise = gitAddCommitPush('/tmp/repo', [], 'test');
    await vi.runAllTimersAsync();
    await promise;
    expect(mockedExecFile).not.toHaveBeenCalled();
  });
});
