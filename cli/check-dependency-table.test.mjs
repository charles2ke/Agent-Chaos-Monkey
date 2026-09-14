import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runCheck, mergePackageReferences } from './check-dependency-table.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRATCH_ROOT = resolve(HERE, '.check-dependency-table-tests');

function makeFixture(prefix, overrides = {}) {
  mkdirSync(SCRATCH_ROOT, { recursive: true });
  const dir = mkdtempSync(join(SCRATCH_ROOT, `${prefix}-`));

  const readme = overrides.readme ?? `# Something

Intro text.

### Dependencies

| Area | Package | Version |
| --- | --- | --- |
| Backend | .NET target framework | \`net8.0\` |
| Backend | Microsoft.NET.Test.Sdk | \`18.10.0\` |
| Backend | xunit / xunit.runner.visualstudio | \`2.9.3\` / \`4.0.0\` |
| Frontend | react / react-dom | \`19.3.0\` |
| Frontend | @playwright/test | \`1.63.0\` |

### Next section
`;

  const lock = overrides.lock ?? {
    name: 'frontend',
    lockfileVersion: 3,
    packages: {
      'node_modules/react': { version: '19.3.0' },
      'node_modules/react-dom': { version: '19.3.0' },
      'node_modules/@playwright/test': { version: '1.63.0' },
    },
  };

  const testsCsproj = overrides.testsCsproj ?? `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup><TargetFramework>net8.0</TargetFramework></PropertyGroup>
  <ItemGroup>
    <PackageReference Include="Microsoft.NET.Test.Sdk" Version="18.10.0" />
    <PackageReference Include="xunit" Version="2.9.3" />
    <PackageReference Include="xunit.runner.visualstudio" Version="4.0.0" />
  </ItemGroup>
</Project>
`;

  const apiCsproj = overrides.apiCsproj ?? `<Project Sdk="Microsoft.NET.Sdk.Web">
  <PropertyGroup><TargetFramework>net8.0</TargetFramework></PropertyGroup>
</Project>
`;

  const readmePath = join(dir, 'README.md');
  const lockPath = join(dir, 'package-lock.json');
  const testsPath = join(dir, 'Tests.csproj');
  const apiPath = join(dir, 'Api.csproj');
  writeFileSync(readmePath, readme);
  writeFileSync(lockPath, JSON.stringify(lock, null, 2));
  writeFileSync(testsPath, testsCsproj);
  writeFileSync(apiPath, apiCsproj);

  return {
    dir,
    opts: {
      readme: readmePath,
      frontendLock: lockPath,
      testsCsproj: testsPath,
      apiCsproj: apiPath,
    },
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

test('match: reports zero problems when every row is accurate', () => {
  const fx = makeFixture('match');
  try {
    const { rows, problems } = runCheck(fx.opts);
    assert.equal(problems.length, 0, JSON.stringify(problems, null, 2));
    assert.equal(rows.length, 5);
  } finally {
    fx.cleanup();
  }
});

test('mismatch: reports a version mismatch when the lockfile disagrees', () => {
  const fx = makeFixture('mismatch', {
    lock: {
      packages: {
        'node_modules/react': { version: '19.4.0' },
        'node_modules/react-dom': { version: '19.3.0' },
        'node_modules/@playwright/test': { version: '1.63.0' },
      },
    },
  });
  try {
    const { problems } = runCheck(fx.opts);
    assert.equal(problems.length, 1);
    assert.equal(problems[0].area, 'Frontend');
    assert.equal(problems[0].name, 'react');
    assert.equal(problems[0].expected, '19.3.0');
    assert.equal(problems[0].actual, '19.4.0');
    assert.match(problems[0].reason, /version mismatch/);
  } finally {
    fx.cleanup();
  }
});

test('mismatch: reports a target-framework mismatch from the API csproj', () => {
  const fx = makeFixture('tfm-mismatch', {
    apiCsproj: `<Project Sdk="Microsoft.NET.Sdk.Web">
  <PropertyGroup><TargetFramework>net9.0</TargetFramework></PropertyGroup>
</Project>
`,
  });
  try {
    const { problems } = runCheck(fx.opts);
    assert.equal(problems.length, 1);
    assert.equal(problems[0].name, '.NET target framework');
    assert.equal(problems[0].expected, 'net8.0');
    assert.equal(problems[0].actual, 'net9.0');
  } finally {
    fx.cleanup();
  }
});

test('missing-row: flags packages the real source no longer declares', () => {
  const fx = makeFixture('missing', {
    // Drop xunit and @playwright/test from the real sources.
    lock: {
      packages: {
        'node_modules/react': { version: '19.3.0' },
        'node_modules/react-dom': { version: '19.3.0' },
      },
    },
    testsCsproj: `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup><TargetFramework>net8.0</TargetFramework></PropertyGroup>
  <ItemGroup>
    <PackageReference Include="Microsoft.NET.Test.Sdk" Version="18.10.0" />
  </ItemGroup>
</Project>
`,
  });
  try {
    const { problems } = runCheck(fx.opts);
    const byName = Object.fromEntries(problems.map((p) => [p.name, p]));
    assert.ok(byName['xunit'], 'expected xunit to be flagged as missing');
    assert.equal(byName['xunit'].actual, undefined);
    assert.match(byName['xunit'].reason, /not found/);
    assert.ok(byName['xunit.runner.visualstudio'], 'expected xunit.runner.visualstudio to be flagged');
    assert.ok(byName['@playwright/test'], 'expected @playwright/test to be flagged as missing');
  } finally {
    fx.cleanup();
  }
});

test('throws a clear error when the README has no dependency table', () => {
  const fx = makeFixture('no-table', {
    readme: '# Nothing here\n\nJust prose.\n',
  });
  try {
    assert.throws(() => runCheck(fx.opts), /Could not find .* table/);
  } finally {
    fx.cleanup();
  }
});

test('mergePackageReferences: combines packages declared in only one project', () => {
  const merged = mergePackageReferences(
    new Map([['xunit', '2.9.3']]),
    new Map([['Azure.Identity', '1.21.0']])
  );
  assert.deepEqual(
    [...merged.entries()].sort(),
    [['Azure.Identity', '1.21.0'], ['xunit', '2.9.3']]
  );
});

test('mergePackageReferences: agreeing versions for the same package are kept', () => {
  const merged = mergePackageReferences(
    new Map([['Azure.Identity', '1.21.0']]),
    new Map([['Azure.Identity', '1.21.0']])
  );
  assert.equal(merged.get('Azure.Identity'), '1.21.0');
});

test('mergePackageReferences: throws when the two projects disagree on a version', () => {
  assert.throws(
    () =>
      mergePackageReferences(
        new Map([['Azure.Identity', '1.20.0']]),
        new Map([['Azure.Identity', '1.21.0']])
      ),
    /conflicting versions.*1\.20\.0.*1\.21\.0/s
  );
});

test('loadSources surfaces a version conflict between apiCsproj and testsCsproj', () => {
  const fx = makeFixture('conflict', {
    testsCsproj: `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup><TargetFramework>net8.0</TargetFramework></PropertyGroup>
  <ItemGroup>
    <PackageReference Include="Azure.Identity" Version="1.20.0" />
  </ItemGroup>
</Project>
`,
    apiCsproj: `<Project Sdk="Microsoft.NET.Sdk.Web">
  <PropertyGroup><TargetFramework>net8.0</TargetFramework></PropertyGroup>
  <ItemGroup>
    <PackageReference Include="Azure.Identity" Version="1.21.0" />
  </ItemGroup>
</Project>
`,
  });
  try {
    assert.throws(() => runCheck(fx.opts), /conflicting versions/);
  } finally {
    fx.cleanup();
  }
});
