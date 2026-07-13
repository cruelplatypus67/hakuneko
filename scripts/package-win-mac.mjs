#!/usr/bin/env node
/**
 * Build targeted desktop packages from macOS:
 *   - Windows x64 portable ZIP (cross-packaged; rcedit icon/version skipped without Wine)
 *   - macOS arm64 DMG
 *
 * Usage (from repo root):
 *   node scripts/package-win-mac.mjs
 *   node scripts/package-win-mac.mjs --skip-install
 *   node scripts/package-win-mac.mjs --no-cleanup   # keep temp/build intermediates
 *
 * Final artifacts land in: dist/
 * Intermediate Electron redists are removed after packaging unless --no-cleanup.
 */
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

const execAsync = promisify(exec);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const electronRoot = path.join(repoRoot, 'app', 'electron');
const dirRes = path.join(repoRoot, 'app', 'res');
const dirApp = path.join(electronRoot, 'build');
const dirBundle = path.join(electronRoot, 'bundle');
const dirDist = path.join(repoRoot, 'dist');

const args = new Set(process.argv.slice(2));
const skipInstall = args.has('--skip-install');
const noCleanup = args.has('--no-cleanup');

function log(...parts) {
    console.log('[package-win-mac]', ...parts);
}

async function run(command, cwd = repoRoot) {
    log('Shell:', command);
    const { stdout, stderr } = await execAsync(command, {
        cwd,
        maxBuffer: 64 * 1024 * 1024,
        env: process.env,
    });
    if (stdout) process.stdout.write(stdout);
    if (stderr) process.stderr.write(stderr);
}

async function download(url, target) {
    log('Download:', url);
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Download failed (${response.status}): ${url}`);
    }
    await fs.mkdir(path.dirname(target), { recursive: true });
    await pipeline(Readable.fromWeb(response.body), createWriteStream(target, { mode: 0o755 }));
}

async function ensureElectronRedist(electronVersion, platform, arch, pkgName, trackedTemps) {
    const base = `electron-v${electronVersion}-${platform}-${arch}`;
    const archive = `${base}.zip`;
    const source = `https://github.com/electron/electron/releases/download/v${electronVersion}/${archive}`;
    const tmpFile = path.resolve(os.tmpdir(), archive);
    const electronDir = path.resolve(os.tmpdir(), base.replace(/^electron/i, pkgName));

    trackedTemps.push(tmpFile, electronDir);

    try {
        await fs.access(tmpFile);
        log('Using cached redist:', tmpFile);
    } catch {
        await download(source, tmpFile);
    }

    log('Extract:', tmpFile, '=>', electronDir);
    await fs.rm(electronDir, { force: true, recursive: true });
    await fs.mkdir(electronDir, { recursive: true });
    // Prefer system unzip (available on macOS) to avoid requiring extract-zip at repo root.
    await run(`unzip -q '${tmpFile}' -d '${electronDir}'`);
    return electronDir;
}

async function packageWindowsX64(pkgConfig, electronVersion, trackedTemps) {
    // Stock bundle-app-zip.mjs assumes Windows (rcedit + PowerShell). Cross-pack on macOS/Linux instead.
    const dirTemp = await ensureElectronRedist(electronVersion, 'win32', 'x64', pkgConfig.name, trackedTemps);

    const appTarget = path.join(dirTemp, 'resources', 'app');
    await fs.rm(appTarget, { force: true, recursive: true });
    await fs.cp(dirApp, appTarget, { recursive: true });

    // Portable userdata next to the binary
    const userdata = path.join(dirTemp, 'userdata');
    await fs.mkdir(userdata, { recursive: true });
    const pkgfile = path.join(appTarget, 'package.json');
    const pkg = JSON.parse(await fs.readFile(pkgfile, 'utf8'));
    pkg['user-data-dir'] = 'userdata';
    await fs.writeFile(pkgfile, JSON.stringify(pkg, null, 4));

    // Rename binary; skip rcedit icon/version stamping off-Windows (needs Wine + .exe).
    const binary = path.join(dirTemp, 'electron.exe');
    const renamed = path.join(dirTemp, `${pkgConfig.name}.exe`);
    try {
        await fs.access(binary);
        await fs.rename(binary, renamed);
    } catch {
        // already renamed or layout differs
    }

    log('Note: skipping rcedit icon/version stamping on non-Windows hosts.');

    await fs.mkdir(dirBundle, { recursive: true });
    const artifactName = `${pkgConfig.name}-v${electronVersion}-win32-x64.zip`;
    const artifact = path.join(dirBundle, artifactName);
    await fs.rm(artifact, { force: true });

    const parent = path.dirname(dirTemp);
    const folder = path.basename(dirTemp);
    await run(`zip -qry '${artifact}' '${folder}'`, parent);
    log('Windows x64 artifact:', artifact);
    return artifact;
}

async function packageMacArm64(pkgConfig, electronVersion, trackedTemps) {
    if (process.platform !== 'darwin') {
        throw new Error('macOS arm64 DMG packaging requires running on macOS (hdiutil/iconutil).');
    }

    // bundle-app-dmg.mjs reads package.json from process.cwd() at import time
    const prevCwd = process.cwd();
    process.chdir(electronRoot);
    try {
        const bundler = await import(path.join(electronRoot, 'scripts', 'bundle-app-dmg.mjs'));
        const dirTemp = await ensureElectronRedist(electronVersion, 'darwin', 'arm64', pkgConfig.name, trackedTemps);
        // Try to unmount a leftover volume from a previous failed run
        try {
            await run(`hdiutil detach '/Volumes/${pkgConfig.title}' -force`, electronRoot);
        } catch { /* not mounted */ }

        await bundler.bundle(dirApp, dirRes, dirTemp, dirBundle);

        const expected = path.join(
            dirBundle,
            path.basename(dirTemp).replace(/^electron/i, pkgConfig.name) + '.dmg'
        );
        log('macOS arm64 artifact:', expected);
        return expected;
    } finally {
        process.chdir(prevCwd);
    }
}

async function copyToDist(filePath) {
    await fs.mkdir(dirDist, { recursive: true });
    const dest = path.join(dirDist, path.basename(filePath));
    await fs.cp(filePath, dest);
    log('Copied to dist:', dest);
    return dest;
}

async function cleanup(trackedTemps) {
    log('Cleaning intermediates…');

    // Electron app build dir + workspace bundle dir (artifacts already copied to dist/)
    for (const dir of [dirApp, dirBundle, path.join(electronRoot, 'node_modules', '.vite')]) {
        await fs.rm(dir, { force: true, recursive: true });
    }

    for (const p of trackedTemps) {
        await fs.rm(p, { force: true, recursive: true });
    }

    // Drop any leftover matching redists in tmp from this project name
    try {
        const tmp = os.tmpdir();
        const entries = await fs.readdir(tmp);
        for (const name of entries) {
            if (
                /^electron-v.*-(win32-x64|darwin-arm64)\.zip$/i.test(name) ||
                /^hakuneko-electron-v.*-(win32-x64|darwin-arm64)$/i.test(name)
            ) {
                await fs.rm(path.join(tmp, name), { force: true, recursive: true });
            }
        }
    } catch (err) {
        log('Temp scan cleanup warning:', err.message);
    }

    log('Cleanup done. Final packages remain in:', dirDist);
}

async function main() {
    if (process.platform !== 'darwin' && process.platform !== 'win32' && process.platform !== 'linux') {
        throw new Error(`Unsupported host platform: ${process.platform}`);
    }

    const pkgConfig = JSON.parse(await fs.readFile(path.join(electronRoot, 'package.json'), 'utf8'));
    const electronVersion = pkgConfig.devDependencies.electron;
    const trackedTemps = [];

    log('Repo:', repoRoot);
    log('Targets: Windows x64 ZIP + macOS arm64 DMG');
    log('Electron:', electronVersion);

    if (!skipInstall) {
        await run('npm install');
    } else {
        log('Skipping npm install (--skip-install)');
    }

    // Build the Electron client application (resources/app payload)
    await run('npm run build --workspace=app/electron');

    await fs.mkdir(dirBundle, { recursive: true });
    await fs.mkdir(dirDist, { recursive: true });

    const winArtifact = await packageWindowsX64(pkgConfig, electronVersion, trackedTemps);
    const macArtifact = await packageMacArm64(pkgConfig, electronVersion, trackedTemps);

    // Collect whatever ended up in bundle/
    const bundleEntries = await fs.readdir(dirBundle);
    const finals = [];
    for (const name of bundleEntries) {
        if (name.endsWith('.zip') || name.endsWith('.dmg')) {
            finals.push(await copyToDist(path.join(dirBundle, name)));
        }
    }

    // Prefer explicit returns if present
    for (const p of [winArtifact, macArtifact].filter(Boolean)) {
        try {
            await fs.access(p);
            if (!finals.includes(path.join(dirDist, path.basename(p)))) {
                finals.push(await copyToDist(p));
            }
        } catch { /* already copied or path differs */ }
    }

    if (!noCleanup) {
        await cleanup(trackedTemps);
    } else {
        log('Skipping cleanup (--no-cleanup)');
    }

    log('=== Done ===');
    const distFiles = await fs.readdir(dirDist);
    for (const f of distFiles) {
        const full = path.join(dirDist, f);
        const st = await fs.stat(full);
        log(`  ${f}  (${(st.size / (1024 * 1024)).toFixed(1)} MiB)`);
    }
}

main().catch((err) => {
    console.error('[package-win-mac] FAILED:', err);
    process.exit(1);
});
