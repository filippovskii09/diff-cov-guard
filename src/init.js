import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

import { ARGS_OPTIONS, CONFIG_FILES, DEFAULT_BRANCH } from './constants.js';

const COMMON_LCOV_PATHS = ['./coverage/lcov.info', './test-results/lcov.info'];
const MAX_SEARCH_DEPTH = 3;
const COVERAGE_SCRIPT_NAME = 'test:coverage';
const ALTERNATIVE_COVERAGE_SCRIPT_NAME = 'test:diff-coverage';
const COVERAGE_SCRIPT_COMMAND = 'npx diff-cov-guard';

function toProjectPath(filePath, cwd = process.cwd()) {
  const projectPath = relative(cwd, filePath);
  return `./${projectPath}`;
}

function pathExists(filePath, cwd) {
  return existsSync(isAbsolute(filePath) ? filePath : join(cwd, filePath));
}

function findLcovRecursively(directory, depth, cwd) {
  if (depth > MAX_SEARCH_DEPTH) {
    return null;
  }

  try {
    const entries = readdirSync(directory, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = join(directory, entry.name);

      if (entry.isFile() && entry.name === 'lcov.info') {
        return toProjectPath(entryPath, cwd);
      }

      if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== '.git') {
        const foundPath = findLcovRecursively(entryPath, depth + 1, cwd);

        if (foundPath) {
          return foundPath;
        }
      }
    }
  } catch {
    return null;
  }

  return null;
}

export function discoverLcovPath(cwd = process.cwd()) {
  for (const lcovPath of COMMON_LCOV_PATHS) {
    if (existsSync(join(cwd, lcovPath))) {
      return lcovPath;
    }
  }

  return findLcovRecursively(cwd, 0, cwd);
}

function branchExists(branch, cwd) {
  try {
    execFileSync('git', ['rev-parse', '--verify', branch], {
      cwd,
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

function parseRemoteHeadBranch(output) {
  const headBranchLine = output.split('\n').find((line) => line.trim().startsWith('HEAD branch:'));

  return headBranchLine?.split(':').at(1)?.trim() ?? '';
}

export function discoverBaseBranch(cwd = process.cwd()) {
  try {
    const output = execFileSync('git', ['remote', 'show', 'origin'], {
      cwd,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    const branch = parseRemoteHeadBranch(output);

    if (branch) {
      return branch;
    }
  } catch {
    // Local repositories without a remote are expected during setup.
  }

  if (branchExists('main', cwd)) {
    return 'main';
  }

  if (branchExists('master', cwd)) {
    return 'master';
  }

  return DEFAULT_BRANCH;
}

function parseThreshold(value) {
  const threshold = Number(value);

  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 100) {
    return null;
  }

  return threshold;
}

function createQuestioner() {
  if (!input.isTTY) {
    const answers = readFileSync(0, 'utf8').split(/\r?\n/);

    return {
      ask(prompt) {
        output.write(prompt);
        return Promise.resolve(answers.shift() ?? '');
      },
      close() {
        return undefined;
      },
    };
  }

  const readline = createInterface({ input, output });

  return {
    ask(prompt) {
      return readline.question(prompt);
    },
    close() {
      readline.close();
    },
  };
}

async function askThreshold(questioner) {
  while (true) {
    const answer = await questioner.ask('Enter desired coverage threshold (default: 90): ');
    const threshold = parseThreshold(answer.trim() || ARGS_OPTIONS.threshold.default);

    if (threshold !== null) {
      return threshold;
    }

    console.log('Threshold must be a number from 0 to 100. Nice try, math still has rules.');
  }
}

async function askLcovPath(questioner, detectedLcovPath, cwd) {
  const fallbackPath = ARGS_OPTIONS.lcov.default;
  const defaultPath = detectedLcovPath ?? fallbackPath;

  while (true) {
    const answer = await questioner.ask(
      `Path to your lcov.info (detected: ${detectedLcovPath ?? 'none'} | default: ${fallbackPath}): `
    );
    const lcovPath = answer.trim() || defaultPath;

    if (!answer.trim() || pathExists(lcovPath, cwd)) {
      return lcovPath;
    }

    console.log(`LCOV file not found at ${lcovPath}. Point me at a real report, please.`);
  }
}

async function askConfigFormat(questioner) {
  while (true) {
    const answer = await questioner.ask('Choose config format: 1) .diffcovguardrc (JSON) 2) Add to package.json ');
    const choice = answer.trim() || '1';

    if (choice === '1' || choice === '2') {
      return choice;
    }

    console.log('Choose 1 or 2. There are only two doors in this hallway.');
  }
}

async function askOverwriteRcConfig(questioner) {
  while (true) {
    const answer = await questioner.ask('File .diffcovguardrc already exists. Overwrite? (y/n) ');
    const choice = answer.trim().toLowerCase();

    if (choice === 'y' || choice === 'yes') {
      return true;
    }

    if (choice === 'n' || choice === 'no') {
      return false;
    }

    console.log('Please answer y or n.');
  }
}

async function askScriptConflict(questioner) {
  while (true) {
    const answer = await questioner.ask(
      `Script "${COVERAGE_SCRIPT_NAME}" already exists. Use "${ALTERNATIVE_COVERAGE_SCRIPT_NAME}" instead? (y/n) `
    );
    const choice = answer.trim().toLowerCase();

    if (choice === 'y' || choice === 'yes') {
      return ALTERNATIVE_COVERAGE_SCRIPT_NAME;
    }

    if (choice === 'n' || choice === 'no') {
      return null;
    }

    console.log('Please answer y or n.');
  }
}

async function readPackageJson(packageJsonPath) {
  if (!existsSync(packageJsonPath)) {
    return {};
  }

  try {
    return JSON.parse(await readFile(packageJsonPath, 'utf8'));
  } catch (error) {
    if (error.code === 'EACCES') {
      throw new Error(`Permission denied to read ${CONFIG_FILES.PACKAGE_JSON_FILE}`, {
        cause: error,
      });
    }

    if (error instanceof SyntaxError) {
      throw new Error(`${CONFIG_FILES.PACKAGE_JSON_FILE} is not valid JSON. Fix it before running init.`, {
        cause: error,
      });
    }

    throw error;
  }
}

async function writeJson(filePath, data, label) {
  try {
    await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`);
  } catch (error) {
    if (error.code === 'EACCES') {
      throw new Error(`Permission denied to write ${label}`, { cause: error });
    }

    throw error;
  }
}

async function readPackageJsonForUpdate(cwd) {
  const packageJsonPath = join(cwd, CONFIG_FILES.PACKAGE_JSON_FILE);

  return {
    packageJson: await readPackageJson(packageJsonPath),
    packageJsonPath,
  };
}

async function addCoverageScript(packageJson, questioner) {
  if (packageJson.scripts?.[COVERAGE_SCRIPT_NAME]) {
    const alternativeScriptName = await askScriptConflict(questioner);

    if (!alternativeScriptName) {
      console.warn(`⚠️  Skipped script creation. Existing "${COVERAGE_SCRIPT_NAME}" was left untouched.`);
      return null;
    }

    packageJson.scripts = {
      ...packageJson.scripts,
      [alternativeScriptName]: COVERAGE_SCRIPT_COMMAND,
    };
    return alternativeScriptName;
  }

  packageJson.scripts = {
    ...(packageJson.scripts ?? {}),
    [COVERAGE_SCRIPT_NAME]: COVERAGE_SCRIPT_COMMAND,
  };

  return COVERAGE_SCRIPT_NAME;
}

async function updatePackageJsonConfig(cwd, config, questioner) {
  const { packageJson, packageJsonPath } = await readPackageJsonForUpdate(cwd);
  packageJson[CONFIG_FILES.PACKAGE_CONFIG_KEY] = config;
  const scriptName = await addCoverageScript(packageJson, questioner);

  await writeJson(packageJsonPath, packageJson, CONFIG_FILES.PACKAGE_JSON_FILE);
  return scriptName;
}

async function updatePackageJsonScript(cwd, questioner) {
  const { packageJson, packageJsonPath } = await readPackageJsonForUpdate(cwd);
  const scriptName = await addCoverageScript(packageJson, questioner);

  await writeJson(packageJsonPath, packageJson, CONFIG_FILES.PACKAGE_JSON_FILE);
  return scriptName;
}

async function createRcConfig(cwd, config, questioner) {
  const configPath = join(cwd, CONFIG_FILES.RC_CONFIG_FILE);

  if (existsSync(configPath)) {
    const shouldOverwrite = await askOverwriteRcConfig(questioner);

    if (!shouldOverwrite) {
      console.warn(`⚠️  Skipped ${CONFIG_FILES.RC_CONFIG_FILE}. Existing config was left untouched.`);
      return;
    }
  }

  await writeJson(configPath, config, CONFIG_FILES.RC_CONFIG_FILE);
}

function createConfig(threshold, lcovPath, baseBranch) {
  return {
    threshold,
    lcovPath,
    baseBranch,
  };
}

function printSuccessMessage(scriptName) {
  if (!scriptName) {
    console.log('✅ Config created! Add a package script when you are ready to guard your PRs.');
    return;
  }

  console.log(`✅ Config created! You can now run 'npm run ${scriptName}' to guard your PRs.`);
}

export async function runInit(cwd = process.cwd()) {
  const detectedLcovPath = discoverLcovPath(cwd);
  const detectedBaseBranch = discoverBaseBranch(cwd);
  const questioner = createQuestioner();

  try {
    console.log('🛡️  diff-cov-guard init');
    console.log(`Detected base branch: ${detectedBaseBranch}`);

    const threshold = await askThreshold(questioner);
    const lcovPath = await askLcovPath(questioner, detectedLcovPath, cwd);
    const configFormat = await askConfigFormat(questioner);
    const config = createConfig(threshold, lcovPath, detectedBaseBranch);
    let scriptName = null;

    if (configFormat === '1') {
      await createRcConfig(cwd, config, questioner);
      scriptName = await updatePackageJsonScript(cwd, questioner);
    } else {
      scriptName = await updatePackageJsonConfig(cwd, config, questioner);
    }

    printSuccessMessage(scriptName);
  } finally {
    questioner.close();
  }
}
