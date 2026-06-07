
import simpleGit from 'simple-git';
import ora from 'ora';
import chalk from 'chalk';

/** Stage all files (including dotfiles and deletions) */
export async function stageAllFiles() {
    const git = simpleGit();
    const spinner = ora('📂 Staging all files...').start();
    try {
        await git.add(['-A']);
        spinner.succeed(' All files staged');
    } catch (err) {
        spinner.fail('Failed to stage files.');
        console.error(chalk.red('Tip: Make sure you have changes to stage and your repository is not empty.'));
        console.error(chalk.cyan('To check status: git status'));
        throw err;
    }
}

/** Return the total number of commits reachable from HEAD. */
export async function getCommitCount(git = simpleGit()) {
    const raw = await git.raw(['rev-list', '--count', 'HEAD']);
    return parseInt(raw.trim(), 10) || 0;
}

/**
 * Cap a requested commit count to the commits available in the repository.
 * Returns 0 when the repository has no commits.
 */
export function resolveEffectiveCommitCount(requestedCount, totalCommits) {
    let count = parseInt(requestedCount, 10);

    if (Number.isNaN(count)) {
        count = 5;
    } else if (count < 1) {
        count = 1;
    }

    if (totalCommits === 0) {
        return 0;
    }

    return Math.min(count, totalCommits);
}

/**
 * Build a git diff range for the last N commits.
 * Falls back to the empty tree when the oldest commit has no parent.
 */
export async function getDiffRangeForRecentCommits(effectiveCount, git = simpleGit()) {
    const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

    if (effectiveCount <= 0) {
        return null;
    }

    const hashesRaw = await git.raw([
        'log',
        '-n',
        `${effectiveCount}`,
        '--pretty=format:%H',
    ]);

    const hashes = hashesRaw.split('\n').filter(Boolean);
    if (hashes.length === 0) {
        return null;
    }

    const oldestHash = hashes[hashes.length - 1];

    try {
        await git.raw(['rev-parse', '--verify', `${oldestHash}^`]);
        return `${oldestHash}^..HEAD`;
    } catch {
        return `${EMPTY_TREE}..HEAD`;
    }
}

/** Validate a Git remote origin URL (HTTPS or SSH). Returns true or an error message. */
export function validateRemoteUrl(url) {
    if (!url || !url.trim()) return 'Remote URL cannot be empty';

    const trimmed = url.trim();
    const httpsPattern = /^https:\/\/[a-zA-Z0-9.-]+(?::\d{1,5})?\/[^\s]+$/;
    const sshScpPattern = /^git@[a-zA-Z0-9.-]+:[a-zA-Z0-9._\/-]+(?:\.git)?$/;
    const sshUrlPattern = /^ssh:\/\/git@[a-zA-Z0-9.-]+(?::\d{1,5})?\/[a-zA-Z0-9._\/-]+(?:\.git)?$/;

    return (httpsPattern.test(trimmed) || sshScpPattern.test(trimmed) || sshUrlPattern.test(trimmed))
        ? true
        : 'Please enter a valid Git remote URL (https://host[:port]/path, ssh://[user@]host[:port]/path, or user@host:path)';
}
