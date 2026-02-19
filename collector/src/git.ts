import { execFile } from 'node:child_process';
import * as logger from './utils/logger.js';

function exec(cmd: string, args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { cwd }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(`${cmd} ${args.join(' ')} failed: ${stderr || err.message}`));
      } else {
        resolve(stdout);
      }
    });
  });
}

export async function gitPull(repoDir: string, dryRun = false): Promise<void> {
  if (dryRun) {
    logger.info('[dry-run] git pull --rebase');
    return;
  }
  await exec('git', ['pull', '--rebase'], repoDir);
}

export async function gitAddCommitPush(
  repoDir: string,
  files: string[],
  message: string,
  dryRun = false,
): Promise<void> {
  if (files.length === 0) {
    logger.info('No files to commit, skipping git push');
    return;
  }

  if (dryRun) {
    logger.info(`[dry-run] git add ${files.length} files, commit, push`);
    return;
  }

  await exec('git', ['add', ...files], repoDir);
  await exec('git', ['-c', 'commit.gpgSign=false', 'commit', '-m', message], repoDir);

  // Retry push up to 3 times
  let lastError: Error | undefined;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await exec('git', ['push'], repoDir);
      return;
    } catch (err) {
      lastError = err as Error;
      if (attempt < 3) {
        const delay = Math.random() * 4000 + 1000; // 1-5 seconds
        logger.warn(`Push failed (attempt ${attempt}/3), retrying in ${Math.round(delay)}ms...`);
        await new Promise(r => setTimeout(r, delay));
        // Pull before retry
        await exec('git', ['pull', '--rebase'], repoDir);
      }
    }
  }
  throw lastError;
}
