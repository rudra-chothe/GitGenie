import assert from 'assert';
import { execSync } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import simpleGit from 'simple-git';
import {
    getCommitCount,
    getDiffRangeForRecentCommits,
    resolveEffectiveCommitCount,
} from '../helpers/gitUtils.js';

function createTempRepo() {
    const dir = mkdtempSync(join(tmpdir(), 'gitgenie-pr-test-'));
    execSync('git init', { cwd: dir, stdio: 'ignore' });
    execSync('git config user.email "test@example.com"', { cwd: dir, stdio: 'ignore' });
    execSync('git config user.name "Test User"', { cwd: dir, stdio: 'ignore' });
    return dir;
}

function commitFile(dir, filename, message) {
    writeFileSync(join(dir, filename), `${filename}\n`);
    execSync(`git add ${filename}`, { cwd: dir, stdio: 'ignore' });
    execSync(`git commit -m "${message}"`, { cwd: dir, stdio: 'ignore' });
}

let passed = 0;
let failed = 0;

async function runTest(name, fn) {
    try {
        await fn();
        console.log(`✅ ${name}`);
        passed++;
    } catch (error) {
        console.log(`❌ ${name}: ${error.message}`);
        failed++;
    }
}

async function runTests() {
    console.log('Running PR commit range unit tests...\n');

    await runTest('resolveEffectiveCommitCount caps to available commits', async () => {
        assert.equal(resolveEffectiveCommitCount(5, 1), 1);
        assert.equal(resolveEffectiveCommitCount(3, 10), 3);
        assert.equal(resolveEffectiveCommitCount(0, 10), 1);
        assert.equal(resolveEffectiveCommitCount(5, 0), 0);
    });

    const singleCommitDir = createTempRepo();
    try {
        commitFile(singleCommitDir, 'README.md', 'docs: initial commit');

        await runTest('getCommitCount returns 1 for a single-commit repo', async () => {
            const git = simpleGit(singleCommitDir);
            assert.equal(await getCommitCount(git), 1);
        });

        await runTest('getDiffRangeForRecentCommits works with one commit', async () => {
            const git = simpleGit(singleCommitDir);
            const range = await getDiffRangeForRecentCommits(1, git);
            assert.ok(range.endsWith('..HEAD'));

            const files = await git.raw(['diff', '--name-only', range]);
            assert.ok(files.includes('README.md'));
        });
    } finally {
        rmSync(singleCommitDir, { recursive: true, force: true });
    }

    const multiCommitDir = createTempRepo();
    try {
        commitFile(multiCommitDir, 'README.md', 'docs: initial commit');
        commitFile(multiCommitDir, 'app.js', 'feat: add app');
        commitFile(multiCommitDir, 'fix.js', 'fix: patch bug');

        await runTest('getDiffRangeForRecentCommits works when count exceeds history', async () => {
            const git = simpleGit(multiCommitDir);
            const range = await getDiffRangeForRecentCommits(5, git);
            const files = await git.raw(['diff', '--name-only', range]);

            assert.ok(files.includes('README.md'));
            assert.ok(files.includes('app.js'));
            assert.ok(files.includes('fix.js'));
        });
    } finally {
        rmSync(multiCommitDir, { recursive: true, force: true });
    }

    console.log('\n' + '='.repeat(50));
    console.log(`Test Results: ${passed} passed, ${failed} failed`);
    console.log('='.repeat(50));

    process.exit(failed === 0 ? 0 : 1);
}

runTests();
