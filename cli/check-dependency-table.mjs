#!/usr/bin/env node
// Verifies that the "Dependencies" table in README.md matches the versions
// declared by the real sources (frontend package-lock, backend csproj files).
//
// Exit 0 when everything matches, exit 1 with a diff listing when not.
// Dependency-free: uses only Node.js built-ins.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const opts = {
    readme: resolve(REPO_ROOT, 'README.md'),
    frontendLock: resolve(REPO_ROOT, 'frontend/package-lock.json'),
    testsCsproj: resolve(REPO_ROOT, 'backend/ChaosMonkey.Tests/ChaosMonkey.Tests.csproj'),
    apiCsproj: resolve(REPO_ROOT, 'backend/ChaosMonkey.Api/ChaosMonkey.Api.csproj'),
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case '--readme': opts.readme = next(); break;
      case '--frontend-lock': opts.frontendLock = next(); break;
      case '--tests-csproj': opts.testsCsproj = next(); break;
      case '--api-csproj': opts.apiCsproj = next(); break;
      case '-h':
      case '--help':
        console.log('Usage: check-dependency-table.mjs [--readme PATH] [--frontend-lock PATH] [--tests-csproj PATH] [--api-csproj PATH]');
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown argument: ${a}`);
    }
  }
  return opts;
}

// Extract the first markdown table whose header row is | Area | Package | Version |.
export function extractDependencyRows(markdown) {
  const lines = markdown.split(/\r?\n/);
  let start = -1;
  for (let i = 0; i < lines.length - 1; i++) {
    const header = lines[i].replace(/\s+/g, ' ').trim();
    const sep = (lines[i + 1] || '').trim();
    if (
      header === '| Area | Package | Version |' &&
      /^\|\s*-{3,}\s*\|\s*-{3,}\s*\|\s*-{3,}\s*\|$/.test(sep)
    ) {
      start = i + 2;
      break;
    }
  }
  if (start < 0) {
    throw new Error('Could not find "| Area | Package | Version |" table in README.md');
  }
  const rows = [];
  for (let i = start; i < lines.length; i++) {
    const line = lines[i];
    if (!line.startsWith('|')) break;
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length !== 3) break;
    rows.push({ area: cells[0], packages: cells[1], versions: cells[2], raw: line });
  }
  return rows;
}

function stripBackticks(s) {
  const m = s.match(/^`(.*)`$/);
  return m ? m[1] : s;
}

// Split a compound "a / b" cell into an array, preserving order.
// Uses whitespace-slash-whitespace as the separator so scoped npm packages
// like "@vitejs/plugin-react" or "@playwright/test" are kept intact.
function splitCompound(cell) {
  return cell.split(/\s+\/\s+/).map((s) => s.trim()).filter(Boolean);
}

// Given a row, return the (packageName, expectedVersion) pairs it declares.
export function pairsForRow(row) {
  const names = splitCompound(row.packages);
  const versions = splitCompound(row.versions).map(stripBackticks);
  if (versions.length === 1 && names.length > 1) {
    return names.map((n) => ({ name: n, expected: versions[0] }));
  }
  if (versions.length !== names.length) {
    throw new Error(
      `Row for "${row.packages}" has ${names.length} packages but ${versions.length} versions`
    );
  }
  return names.map((n, i) => ({ name: n, expected: versions[i] }));
}

export function readFrontendVersion(lockJson, name) {
  const key = `node_modules/${name}`;
  const entry = lockJson.packages && lockJson.packages[key];
  return entry ? entry.version : undefined;
}

// Very small XML scan: pull <PackageReference Include="X" Version="Y" /> pairs.
export function parsePackageReferences(csprojXml) {
  const out = new Map();
  const re = /<PackageReference\b([^>]*?)\/?>/g;
  let m;
  while ((m = re.exec(csprojXml)) !== null) {
    const attrs = m[1];
    const inc = /\bInclude\s*=\s*"([^"]+)"/.exec(attrs);
    const ver = /\bVersion\s*=\s*"([^"]+)"/.exec(attrs);
    if (inc && ver) out.set(inc[1], ver[1]);
  }
  return out;
}

export function parseTargetFramework(csprojXml) {
  const m = /<TargetFramework>\s*([^<\s]+)\s*<\/TargetFramework>/.exec(csprojXml);
  return m ? m[1] : undefined;
}

export function resolveActual(area, name, sources) {
  if (area === 'Backend') {
    if (name === '.NET target framework') return sources.targetFramework;
    return sources.backendPackages.get(name);
  }
  if (area === 'Frontend') {
    return readFrontendVersion(sources.frontendLock, name);
  }
  throw new Error(`Unknown area "${area}" in dependency table`);
}

export function check(sources, rows) {
  const problems = [];
  for (const row of rows) {
    let pairs;
    try {
      pairs = pairsForRow(row);
    } catch (err) {
      problems.push({ area: row.area, name: row.packages, expected: row.versions, actual: undefined, reason: err.message });
      continue;
    }
    for (const { name, expected } of pairs) {
      let actual;
      try {
        actual = resolveActual(row.area, name, sources);
      } catch (err) {
        problems.push({ area: row.area, name, expected, actual: undefined, reason: err.message });
        continue;
      }
      if (actual === undefined) {
        problems.push({
          area: row.area,
          name,
          expected,
          actual: undefined,
          reason: 'not found in real source',
        });
      } else if (actual !== expected) {
        problems.push({
          area: row.area,
          name,
          expected,
          actual,
          reason: 'version mismatch',
        });
      }
    }
  }
  return problems;
}

// Merges two PackageReference maps; a package declared in both projects must not
// disagree on version, since the dependency table has only one column to represent it.
export function mergePackageReferences(testsPackages, apiPackages) {
  const merged = new Map(testsPackages);
  for (const [name, version] of apiPackages) {
    const existing = merged.get(name);
    if (existing !== undefined && existing !== version) {
      throw new Error(
        `Package "${name}" is referenced at conflicting versions across backend projects: ` +
          `${existing} (tests) vs ${version} (api)`
      );
    }
    merged.set(name, version);
  }
  return merged;
}

export function loadSources(opts) {
  const testsPackages = parsePackageReferences(readFileSync(opts.testsCsproj, 'utf8'));
  const apiXml = readFileSync(opts.apiCsproj, 'utf8');
  const apiPackages = parsePackageReferences(apiXml);
  const backendPackages = mergePackageReferences(testsPackages, apiPackages);
  return {
    frontendLock: JSON.parse(readFileSync(opts.frontendLock, 'utf8')),
    backendPackages,
    targetFramework: parseTargetFramework(apiXml),
  };
}

export function runCheck(opts) {
  const rows = extractDependencyRows(readFileSync(opts.readme, 'utf8'));
  const sources = loadSources(opts);
  return { rows, problems: check(sources, rows) };
}

function formatProblems(problems) {
  const lines = [];
  for (const p of problems) {
    const actual = p.actual === undefined ? '(missing)' : p.actual;
    lines.push(`- [${p.area}] ${p.name}: README says ${p.expected}, real source says ${actual} (${p.reason})`);
  }
  return lines.join('\n');
}

// CLI entry point — only when invoked directly.
if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const opts = parseArgs(process.argv.slice(2));
    const { rows, problems } = runCheck(opts);
    if (problems.length === 0) {
      console.log(`✓ Dependency table matches real sources (${rows.length} rows checked).`);
      process.exit(0);
    }
    console.error(`✗ Dependency table is out of sync (${problems.length} issue(s)):`);
    console.error(formatProblems(problems));
    process.exit(1);
  } catch (err) {
    console.error(`check-dependency-table: ${err.message}`);
    process.exit(2);
  }
}
