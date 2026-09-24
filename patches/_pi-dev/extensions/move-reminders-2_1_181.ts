import { readFileSync } from 'node:fs';
import { homedir, release, type as osType } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getAgentDir, type ExtensionAPI } from '@earendil-works/pi-coding-agent';

type PromptFileReference = { $ref: string };
type PromptValue = string | PromptFileReference;
type SystemPlacement = 'after_all' | 'after_reminders' | 'before_reminders';

type PromptConfigSource = {
  reminders: PromptValue[];
  system: PromptValue[];
  systemPlacement?: SystemPlacement;
};

type PromptConfig = {
  reminders: string[];
  system: string[];
  systemPlacement: SystemPlacement;
};

type EnvironmentSnapshot = {
  crs_cwd: string;
  crs_workspace: string;
  crs_is_repo: string;
  crs_platform: string;
  crs_shell: string;
  crs_os_ver: string;
  crs_branch: string;
  crs_master: string;
  crs_repo_user: string;
  crs_repo_status_short: string;
  crs_repo_recent_commits: string;
  crs_today: string;
  crs_global_instructions_path: string;
  crs_global_instructions: string;
  crs_local_instructions: string;
  crs_memory_dir: string;
};

type PromptValues = EnvironmentSnapshot & {
  crs_model_short: string;
  crs_model_full: string;
  crs_model_name: string;
};

type ProviderMessage = {
  role: string;
  content: unknown;
  [key: string]: unknown;
};

type ProviderPayload = {
  messages?: ProviderMessage[];
  tools?: unknown;
  [key: string]: unknown;
};

type ExecResult = {
  code: number;
  stdout: string;
};

const extensionDir = dirname(fileURLToPath(import.meta.url));
const promptConfigPath = resolve(extensionDir, '../reminders-to-system/move.json');
const placeholderPattern = /\{\{(crs_[^}]*)\}\}/gi;

function isProviderPayload(payload: unknown): payload is ProviderPayload {
  return typeof payload === 'object' && payload !== null && !Array.isArray(payload);
}

function commandLineFlagValue(name: string) {
  const flag = `--${name}`;
  for (let index = 2; index < process.argv.length; index++) {
    const argument = process.argv[index];
    if (!argument) continue;
    if (argument === flag) return process.argv[index + 1];
    if (argument.startsWith(`${flag}=`)) return argument.slice(flag.length + 1);
  }
}

function loadHappierPromptAddition() {
  const configPath = commandLineFlagValue('happy-tools-config');
  if (!configPath?.trim()) return;
  try {
    const config = JSON.parse(readFileSync(configPath, 'utf8')) as unknown;
    if (typeof config !== 'object' || config === null || Array.isArray(config)) return;
    const promptAddition = (config as { promptAddition?: unknown }).promptAddition;
    return typeof promptAddition === 'string' && promptAddition.trim()
      ? promptAddition
      : undefined;
  } catch {
    return;
  }
}

function isPromptFileReference(value: unknown): value is PromptFileReference {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).length === 1 &&
    typeof (value as { $ref?: unknown }).$ref === 'string' &&
    (value as { $ref: string }).$ref.length > 0
  );
}

function loadPromptEntry(value: unknown, section: 'reminders' | 'system', index: number, configDir: string) {
  if (typeof value === 'string' && value.length > 0) return value;
  if (isPromptFileReference(value)) {
    const path = isAbsolute(value.$ref) ? value.$ref : resolve(configDir, value.$ref);
    try {
      return readFileSync(path, 'utf8');
    } catch (error) {
      throw new Error(`Failed to load prompt entry at ${section}[${index}]: ${path}.`, { cause: error });
    }
  }
  throw new Error(`Invalid prompt entry at ${section}[${index}].`);
}

function loadPromptConfig(): PromptConfig {
  const config = JSON.parse(readFileSync(promptConfigPath, 'utf8')) as PromptConfigSource;
  const configDir = dirname(promptConfigPath);
  if (!Array.isArray(config.reminders) || !Array.isArray(config.system)) {
    throw new Error('Invalid Omni Claude Code prompt configuration.');
  }
  const systemPlacement = config.systemPlacement ?? 'after_all';
  if (
    systemPlacement !== 'after_all' &&
    systemPlacement !== 'after_reminders' &&
    systemPlacement !== 'before_reminders'
  ) {
    throw new Error(`Invalid systemPlacement: ${String(config.systemPlacement)}.`);
  }
  return {
    reminders: config.reminders.map((value, index) => loadPromptEntry(value, 'reminders', index, configDir)),
    system: config.system.map((value, index) => loadPromptEntry(value, 'system', index, configDir)),
    systemPlacement,
  };
}

function usedPlaceholders(prompt: PromptConfig) {
  const placeholders = new Set<string>();
  for (const text of [...prompt.reminders, ...prompt.system]) {
    for (const match of text.matchAll(placeholderPattern)) placeholders.add(match[1].toLowerCase());
  }
  return placeholders;
}

function trimOutput(stdout: string, multiline = false) {
  const value = stdout.replace(/[\r\n]+$/u, '');
  return multiline ? value : value.replace(/[\r\n]/gu, '');
}

async function runGit(pi: ExtensionAPI, cwd: string, args: string[]) {
  try {
    return (await pi.exec('git', args, { cwd, timeout: 1111 })) as ExecResult;
  } catch {
    return { code: 1, stdout: '' };
  }
}

async function resolveMainBranch(pi: ExtensionAPI, cwd: string) {
  const remoteHead = await runGit(pi, cwd, ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD']);
  if (remoteHead.code === 0 && trimOutput(remoteHead.stdout)) {
    return trimOutput(remoteHead.stdout).replace(/^origin\//u, '');
  }
  for (const branch of ['master', 'main']) {
    const result = await runGit(pi, cwd, ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`]);
    if (result.code === 0) return branch;
  }
  return 'unknown';
}

function shellName() {
  const shell = process.platform === 'win32'
    ? process.env.ComSpec || process.env.COMSPEC
    : process.env.SHELL;
  if (shell) return basename(shell);
  if (process.platform === 'linux') return 'bash';
  if (process.platform === 'win32') return 'cmd';
  return 'sh';
}

function localDate(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function globalInstructions() {
  for (const path of [resolve(homedir(), '.AGENTS.md'), resolve(homedir(), '.claude/CLAUDE.md')]) {
    try {
      return { path, text: readFileSync(path, 'utf8') };
    } catch {
      // Try the configured fallback file.
    }
  }
  return { path: '(none)', text: '' };
}

function localInstructions(cwd: string) {
  try {
    return readFileSync(join(cwd, 'AGENTS.md'), 'utf8');
  } catch {
    return '';
  }
}

function memoryDir(cwd: string) {
  const encodedCwd = resolve(cwd).replace(/[^A-Za-z0-9-]/gu, '-');
  return join(getAgentDir(), 'projects', encodedCwd, 'memory');
}

async function collectEnvironmentSnapshot(pi: ExtensionAPI, cwd: string, placeholders: Set<string>) {
  const sessionCwd = cwd;
  const sessionDate = new Date();
  const needed = (name: keyof EnvironmentSnapshot) => placeholders.has(name);
  const displayCwd = sessionCwd.replace(/\\/gu, '/');
  const global = needed('crs_global_instructions') || needed('crs_global_instructions_path')
    ? globalInstructions()
    : { path: '(none)', text: '' };
  const snapshot: EnvironmentSnapshot = {
    crs_cwd: displayCwd,
    crs_workspace: displayCwd,
    crs_is_repo: 'false',
    crs_platform: process.platform,
    crs_shell: shellName(),
    crs_os_ver: `${osType()} ${release()}`,
    crs_branch: 'unknown',
    crs_master: 'unknown',
    crs_repo_user: 'unknown',
    crs_repo_status_short: '(none)',
    crs_repo_recent_commits: '(none)',
    crs_today: localDate(sessionDate),
    crs_global_instructions_path: global.path,
    crs_global_instructions: global.text,
    crs_local_instructions: needed('crs_local_instructions') ? localInstructions(sessionCwd) : '',
    crs_memory_dir: needed('crs_memory_dir') ? memoryDir(sessionCwd) : '',
  };
  const needsGit = [
    'crs_workspace',
    'crs_is_repo',
    'crs_branch',
    'crs_master',
    'crs_repo_user',
    'crs_repo_status_short',
    'crs_repo_recent_commits',
  ].some((name) => placeholders.has(name));
  if (!needsGit) return snapshot;

  const repository = await runGit(pi, sessionCwd, ['rev-parse', '--is-inside-work-tree']);
  const isRepository = repository.code === 0 && trimOutput(repository.stdout) === 'true';
  snapshot.crs_is_repo = String(isRepository);
  if (!isRepository) {
    snapshot.crs_branch = '(not a git repository)';
    snapshot.crs_master = '(not a git repository)';
    snapshot.crs_repo_status_short = '(not a git repository)';
    return snapshot;
  }

  const [workspace, branch, master, user, status, commits] = await Promise.all([
    needed('crs_workspace')
      ? runGit(pi, sessionCwd, ['rev-parse', '--show-toplevel'])
      : Promise.resolve({ code: 1, stdout: '' }),
    needed('crs_branch')
      ? runGit(pi, sessionCwd, ['symbolic-ref', '--quiet', '--short', 'HEAD'])
      : Promise.resolve({ code: 1, stdout: '' }),
    needed('crs_master') ? resolveMainBranch(pi, sessionCwd) : Promise.resolve('unknown'),
    needed('crs_repo_user') ? runGit(pi, sessionCwd, ['config', 'user.name']) : Promise.resolve({ code: 1, stdout: '' }),
    needed('crs_repo_status_short')
      ? runGit(pi, sessionCwd, ['--no-optional-locks', 'status', '--short'])
      : Promise.resolve({ code: 1, stdout: '' }),
    needed('crs_repo_recent_commits')
      ? runGit(pi, sessionCwd, ['--no-pager', 'log', '-5', '--oneline'])
      : Promise.resolve({ code: 1, stdout: '' }),
  ]);
  if (needed('crs_workspace') && workspace.code === 0) {
    snapshot.crs_workspace = trimOutput(workspace.stdout).replace(/\\/gu, '/') || displayCwd;
  }
  if (needed('crs_branch')) {
    snapshot.crs_branch = branch.code === 0 ? trimOutput(branch.stdout) || 'unknown' : 'detached';
  }
  snapshot.crs_master = master;
  if (needed('crs_repo_user')) snapshot.crs_repo_user = trimOutput(user.stdout) || 'unknown';
  if (needed('crs_repo_status_short')) {
    snapshot.crs_repo_status_short = trimOutput(status.stdout, true) || '(clean)';
  }
  if (needed('crs_repo_recent_commits')) {
    snapshot.crs_repo_recent_commits = trimOutput(commits.stdout, true) || '(none)';
  }
  return snapshot;
}

function resolvePlaceholders(text: string, values: PromptValues) {
  const deferred = new Set(['crs_global_instructions', 'crs_local_instructions']);
  const withoutInstructions = text.replace(placeholderPattern, (marker, name: string) => {
    const key = name.toLowerCase() as keyof PromptValues;
    return deferred.has(key) ? marker : values[key] ?? marker;
  });
  const unresolved = withoutInstructions.match(/\{\{crs_[^}]*\}\}/gi);
  if (unresolved?.some((marker) => !deferred.has(marker.slice(2, -2).toLowerCase()))) {
    throw new Error(`Unknown prompt placeholder: ${unresolved.join(', ')}.`);
  }
  return withoutInstructions
    .replace(/\{\{crs_global_instructions\}\}/gi, values.crs_global_instructions)
    .replace(/\{\{crs_local_instructions\}\}/gi, values.crs_local_instructions);
}

export default function prependClaudeCodePrompt(pi: ExtensionAPI) {
  const prompt = loadPromptConfig();
  const placeholders = usedPlaceholders(prompt);
  let environmentSnapshot: Promise<EnvironmentSnapshot> | undefined;
  let appendedSystemPrompts: string[] = [];

  pi.on('session_start', (_event, ctx) => {
    environmentSnapshot = collectEnvironmentSnapshot(pi, ctx.cwd, placeholders);
  });

  pi.on('before_agent_start', (event) => {
    appendedSystemPrompts = [
      loadHappierPromptAddition(),
      event.systemPromptOptions.appendSystemPrompt,
    ].filter((text, index, values): text is string => (
      typeof text === 'string' && text.trim().length > 0 && values.indexOf(text) === index
    ));
  });

  pi.on('before_provider_request', async (event, ctx) => {
    if (!['omni', 'anthropic'].includes(ctx.model?.provider ?? '') || !isProviderPayload(event.payload)) return;
    environmentSnapshot ??= collectEnvironmentSnapshot(pi, ctx.cwd, placeholders);
    const snapshot = await environmentSnapshot;
    const model = ctx.model;
    const values: PromptValues = {
      ...snapshot,
      crs_model_short: model?.id ?? 'unknown',
      crs_model_full: `${model ? ctx.modelRegistry.getProviderDisplayName(model.provider) : 'unknown'}/${model?.id ?? 'unknown'}`,
      crs_model_name: model?.name ?? 'unknown',
    };
    const reminders = prompt.reminders.map((text) => resolvePlaceholders(text, values));
    const { tools, messages = [], ...payload } = event.payload;
    const system = [
      ...prompt.system.map((text) => resolvePlaceholders(text, values)),
      ...appendedSystemPrompts,
    ];
    const filteredMessages = messages.filter((message) => message.role !== 'developer');
    const combined = prompt.systemPlacement === 'before_reminders'
      ? [...system, ...reminders]
      : [...reminders, ...system];
    const result = prompt.systemPlacement === 'after_all'
      ? {
          ...payload,
          messages: [
            { role: 'user', content: reminders.map((text) => ({ type: 'text', text })) },
            ...filteredMessages,
          ],
          system: system.map((text, index) => ({
            type: 'text',
            text,
            ...(index > 0 && index < prompt.system.length
              ? { cache_control: { type: 'ephemeral' } }
              : {}),
          })),
        }
      : {
          ...payload,
          messages: [
            { role: 'user', content: combined.map((text) => ({ type: 'text', text })) },
            ...filteredMessages,
          ],
        };
    return { ...result, ...(tools === undefined ? {} : { tools }) };
  });
}
