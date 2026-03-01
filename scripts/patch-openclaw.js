#!/usr/bin/env node
// patch-openclaw.js — Patch OpenClaw to support `replacePrompt` in the
// `before_agent_start` hook, enabling plugins to fully replace (not just
// prepend to) the user's message before it reaches the model.
//
// Strategy A (preferred): patch OpenClaw TypeScript source files, delete stale
//   hashed bundles, then rebuild via `pnpm tsdown`.  Survives upgrades because
//   the patch lives in source, not in content-hashed output.
//
// Strategy B (fallback): patch the compiled .js bundles directly.  Used when
//   source files are not present (e.g. npm-installed OpenClaw without source).
//   Fragile against OpenClaw rebuilds — bundles will need re-patching after
//   each `pnpm tsdown` run in the OpenClaw directory.
//
// Usage:
//   node scripts/patch-openclaw.js [options]
//
// Options:
//   --openclaw-dir <path>   OpenClaw root (contains src/ and/or dist/).
//                           Default: $OPENCLAW_SOURCE_DIR or cwd.
//   --plugin-dir <path>     Installed plugin directory (contains node_modules/).
//                           Default: $PLUGIN_INSTALL_DIR or omitted.
//   --dry-run               Print what would change without writing anything.
//   --verbose               Log every file checked.
//   --no-rebuild            Skip `pnpm tsdown` after source patching.

import fs   from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

// ── CLI args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
let openclaw_dir = process.env['OPENCLAW_SOURCE_DIR'] ?? process.cwd();
let plugin_dir   = process.env['PLUGIN_INSTALL_DIR']  ?? null;
let dry_run      = false;
let verbose      = false;
let no_rebuild   = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--openclaw-dir')  { openclaw_dir = args[++i]; continue; }
  if (args[i] === '--plugin-dir')    { plugin_dir   = args[++i]; continue; }
  if (args[i] === '--dry-run')       { dry_run      = true;      continue; }
  if (args[i] === '--verbose')       { verbose      = true;      continue; }
  if (args[i] === '--no-rebuild')    { no_rebuild   = true;      continue; }
  console.error(`Unknown option: ${args[i]}`);
  process.exit(1);
}

// ── Source-level patch definitions ───────────────────────────────────────────
// Each entry: { file (relative to openclaw_dir), sentinel, needle, replacement }

const SOURCE_PATCHES = [
  {
    file: 'src/plugins/types.ts',
    sentinel: 'replacePrompt?: string',
    needle:
      'export type PluginHookBeforeAgentStartResult = {\n' +
      '  systemPrompt?: string;\n' +
      '  prependContext?: string;\n' +
      '};',
    replacement:
      'export type PluginHookBeforeAgentStartResult = {\n' +
      '  systemPrompt?: string;\n' +
      '  prependContext?: string;\n' +
      '  /** If set, replaces the user prompt entirely instead of prepending to it. */\n' +
      '  replacePrompt?: string;\n' +
      '};',
  },
  {
    file: 'src/plugins/hooks.ts',
    sentinel: 'replacePrompt: next.replacePrompt ?? acc?.replacePrompt',
    needle:
      '      (acc, next) => ({\n' +
      '        systemPrompt: next.systemPrompt ?? acc?.systemPrompt,\n' +
      '        prependContext:\n' +
      '          acc?.prependContext && next.prependContext\n' +
      '            ? `${acc.prependContext}\\n\\n${next.prependContext}`\n' +
      '            : (next.prependContext ?? acc?.prependContext),\n' +
      '      }),',
    replacement:
      '      (acc, next) => ({\n' +
      '        systemPrompt: next.systemPrompt ?? acc?.systemPrompt,\n' +
      '        prependContext:\n' +
      '          acc?.prependContext && next.prependContext\n' +
      '            ? `${acc.prependContext}\\n\\n${next.prependContext}`\n' +
      '            : (next.prependContext ?? acc?.prependContext),\n' +
      '        replacePrompt: next.replacePrompt ?? acc?.replacePrompt,\n' +
      '      }),',
  },
  {
    file: 'src/agents/pi-embedded-runner/run/attempt.ts',
    sentinel: 'hookResult?.replacePrompt',
    needle:
      '            if (hookResult?.prependContext) {\n' +
      '              effectivePrompt = `${hookResult.prependContext}\\n\\n${params.prompt}`;\n' +
      '              log.debug(\n' +
      '                `hooks: prepended context to prompt (${hookResult.prependContext.length} chars)`,\n' +
      '              );\n' +
      '            }',
    replacement:
      '            if (hookResult?.replacePrompt) {\n' +
      '              effectivePrompt = hookResult.replacePrompt;\n' +
      '              log.debug(\n' +
      '                `hooks: replaced prompt via before_agent_start (${hookResult.replacePrompt.length} chars)`,\n' +
      '              );\n' +
      '            } else if (hookResult?.prependContext) {\n' +
      '              effectivePrompt = `${hookResult.prependContext}\\n\\n${params.prompt}`;\n' +
      '              log.debug(\n' +
      '                `hooks: prepended context to prompt (${hookResult.prependContext.length} chars)`,\n' +
      '              );\n' +
      '            }',
  },
  // Wire up after_tool_call — the hook is defined and typed but the runner is never called.
  // This adds the fire-and-forget call after execute() returns in the tool wrapper.
  {
    file: 'src/agents/pi-tools.before-tool-call.ts',
    sentinel: 'runAfterToolCall',
    needle:
      'export function wrapToolWithBeforeToolCallHook(\n' +
      '  tool: AnyAgentTool,\n' +
      '  ctx?: HookContext,\n' +
      '): AnyAgentTool {\n' +
      '  const execute = tool.execute;\n' +
      '  if (!execute) {\n' +
      '    return tool;\n' +
      '  }\n' +
      '  const toolName = tool.name || "tool";\n' +
      '  return {\n' +
      '    ...tool,\n' +
      '    execute: async (toolCallId, params, signal, onUpdate) => {\n' +
      '      const outcome = await runBeforeToolCallHook({\n' +
      '        toolName,\n' +
      '        params,\n' +
      '        toolCallId,\n' +
      '        ctx,\n' +
      '      });\n' +
      '      if (outcome.blocked) {\n' +
      '        throw new Error(outcome.reason);\n' +
      '      }\n' +
      '      return await execute(toolCallId, outcome.params, signal, onUpdate);\n' +
      '    },\n' +
      '  };\n' +
      '}',
    replacement:
      'export function wrapToolWithBeforeToolCallHook(\n' +
      '  tool: AnyAgentTool,\n' +
      '  ctx?: HookContext,\n' +
      '): AnyAgentTool {\n' +
      '  const execute = tool.execute;\n' +
      '  if (!execute) {\n' +
      '    return tool;\n' +
      '  }\n' +
      '  const toolName = tool.name || "tool";\n' +
      '  return {\n' +
      '    ...tool,\n' +
      '    execute: async (toolCallId, params, signal, onUpdate) => {\n' +
      '      const outcome = await runBeforeToolCallHook({\n' +
      '        toolName,\n' +
      '        params,\n' +
      '        toolCallId,\n' +
      '        ctx,\n' +
      '      });\n' +
      '      if (outcome.blocked) {\n' +
      '        throw new Error(outcome.reason);\n' +
      '      }\n' +
      '      const start = Date.now();\n' +
      '      let result: unknown;\n' +
      '      let errorMsg: string | undefined;\n' +
      '      try {\n' +
      '        result = await execute(toolCallId, outcome.params, signal, onUpdate);\n' +
      '      } catch (err) {\n' +
      '        errorMsg = err instanceof Error ? err.message : String(err);\n' +
      '        throw err;\n' +
      '      } finally {\n' +
      '        const hookRunner = getGlobalHookRunner();\n' +
      '        if (hookRunner?.hasHooks("after_tool_call")) {\n' +
      '          void hookRunner.runAfterToolCall(\n' +
      '            { toolName, params: isPlainObject(outcome.params) ? outcome.params : {}, result, error: errorMsg, durationMs: Date.now() - start },\n' +
      '            { toolName, agentId: ctx?.agentId, sessionKey: ctx?.sessionKey },\n' +
      '          ).catch((e: unknown) => log.warn(`after_tool_call hook failed: tool=${toolName} error=${String(e)}`));\n' +
      '        }\n' +
      '      }\n' +
      '      return result;\n' +
      '    },\n' +
      '  };\n' +
      '}',
  },
];

// ── Bundle-level patch definitions (fallback) ─────────────────────────────────
// Applied to compiled .js files when source is not available.
// Idempotent: sentinel check prevents double-patching.

const BUNDLE_PATCHES = [
  // Merger function — tab-indented (hashed bundles: pi-embedded-*.js, extensionAPI.js, etc.)
  {
    name: 'bundled runner — replacePrompt merger (tab-indented)',
    sentinel: 'replacePrompt: next.replacePrompt ?? acc?.replacePrompt',
    needle:
      '\t\treturn runModifyingHook("before_agent_start", event, ctx, (acc, next) => ({\n' +
      '\t\t\tsystemPrompt: next.systemPrompt ?? acc?.systemPrompt,\n' +
      '\t\t\tprependContext: acc?.prependContext && next.prependContext ? `${acc.prependContext}\\n\\n${next.prependContext}` : next.prependContext ?? acc?.prependContext\n' +
      '\t\t}));',
    replacement:
      '\t\treturn runModifyingHook("before_agent_start", event, ctx, (acc, next) => ({\n' +
      '\t\t\tsystemPrompt: next.systemPrompt ?? acc?.systemPrompt,\n' +
      '\t\t\tprependContext: acc?.prependContext && next.prependContext ? `${acc.prependContext}\\n\\n${next.prependContext}` : next.prependContext ?? acc?.prependContext,\n' +
      '\t\t\treplacePrompt: next.replacePrompt ?? acc?.replacePrompt\n' +
      '\t\t}));',
  },
  // Dispatch — tab-indented (5 tabs, log$2 variable name used in bundles)
  {
    name: 'bundled runner — replacePrompt dispatch (tab-indented, log$2)',
    sentinel: 'hookResult?.replacePrompt',
    needle:
      '\t\t\t\t\tif (hookResult?.prependContext) {\n' +
      '\t\t\t\t\t\teffectivePrompt = `${hookResult.prependContext}\\n\\n${params.prompt}`;\n' +
      '\t\t\t\t\t\tlog$2.debug(`hooks: prepended context to prompt (${hookResult.prependContext.length} chars)`);\n' +
      '\t\t\t\t\t}',
    replacement:
      '\t\t\t\t\tif (hookResult?.replacePrompt) {\n' +
      '\t\t\t\t\t\teffectivePrompt = hookResult.replacePrompt;\n' +
      '\t\t\t\t\t\tlog$2.debug(`hooks: replaced prompt via before_agent_start (${hookResult.replacePrompt.length} chars)`);\n' +
      '\t\t\t\t\t} else if (hookResult?.prependContext) {\n' +
      '\t\t\t\t\t\teffectivePrompt = `${hookResult.prependContext}\\n\\n${params.prompt}`;\n' +
      '\t\t\t\t\t\tlog$2.debug(`hooks: prepended context to prompt (${hookResult.prependContext.length} chars)`);\n' +
      '\t\t\t\t\t}',
  },
  // npm package hooks.js — 4-space indented
  {
    name: 'hooks.js — replacePrompt merger (4-space)',
    sentinel: 'replacePrompt: next.replacePrompt ?? acc?.replacePrompt',
    needle:
      '        return runModifyingHook("before_agent_start", event, ctx, (acc, next) => ({\n' +
      '            systemPrompt: next.systemPrompt ?? acc?.systemPrompt,\n' +
      '            prependContext: acc?.prependContext && next.prependContext\n' +
      '                ? `${acc.prependContext}\\n\\n${next.prependContext}`\n' +
      '                : (next.prependContext ?? acc?.prependContext),\n' +
      '        }));',
    replacement:
      '        return runModifyingHook("before_agent_start", event, ctx, (acc, next) => ({\n' +
      '            systemPrompt: next.systemPrompt ?? acc?.systemPrompt,\n' +
      '            prependContext: acc?.prependContext && next.prependContext\n' +
      '                ? `${acc.prependContext}\\n\\n${next.prependContext}`\n' +
      '                : (next.prependContext ?? acc?.prependContext),\n' +
      '            replacePrompt: next.replacePrompt ?? acc?.replacePrompt,\n' +
      '        }));',
  },
  // npm package attempt.js — 24-space indented
  {
    name: 'attempt.js — replacePrompt dispatch (24-space)',
    sentinel: 'hookResult?.replacePrompt',
    needle:
      '                        if (hookResult?.prependContext) {\n' +
      '                            effectivePrompt = `${hookResult.prependContext}\\n\\n${params.prompt}`;\n' +
      '                            log.debug(`hooks: prepended context to prompt (${hookResult.prependContext.length} chars)`);\n' +
      '                        }',
    replacement:
      '                        if (hookResult?.replacePrompt) {\n' +
      '                            effectivePrompt = hookResult.replacePrompt;\n' +
      '                            log.debug(`hooks: replaced prompt via before_agent_start (${hookResult.replacePrompt.length} chars)`);\n' +
      '                        } else if (hookResult?.prependContext) {\n' +
      '                            effectivePrompt = `${hookResult.prependContext}\\n\\n${params.prompt}`;\n' +
      '                            log.debug(`hooks: prepended context to prompt (${hookResult.prependContext.length} chars)`);\n' +
      '                        }',
  },
  // Wire up after_tool_call — compiled bundles (tab-indented, all hashed bundle files).
  // runAfterToolCall is exposed via getGlobalHookRunner(); the log$N variable name
  // differs per bundle so the catch handler uses console.warn to stay portable.
  {
    name: 'bundled runner — after_tool_call wire-up (tab-indented)',
    sentinel: 'runAfterToolCall(',
    needle:
      'function wrapToolWithBeforeToolCallHook(tool, ctx) {\n' +
      '\tconst execute = tool.execute;\n' +
      '\tif (!execute) return tool;\n' +
      '\tconst toolName = tool.name || "tool";\n' +
      '\treturn {\n' +
      '\t\t...tool,\n' +
      '\t\texecute: async (toolCallId, params, signal, onUpdate) => {\n' +
      '\t\t\tconst outcome = await runBeforeToolCallHook({\n' +
      '\t\t\t\ttoolName,\n' +
      '\t\t\t\tparams,\n' +
      '\t\t\t\ttoolCallId,\n' +
      '\t\t\t\tctx\n' +
      '\t\t\t});\n' +
      '\t\t\tif (outcome.blocked) throw new Error(outcome.reason);\n' +
      '\t\t\treturn await execute(toolCallId, outcome.params, signal, onUpdate);\n' +
      '\t\t}\n' +
      '\t};\n' +
      '}',
    replacement:
      'function wrapToolWithBeforeToolCallHook(tool, ctx) {\n' +
      '\tconst execute = tool.execute;\n' +
      '\tif (!execute) return tool;\n' +
      '\tconst toolName = tool.name || "tool";\n' +
      '\treturn {\n' +
      '\t\t...tool,\n' +
      '\t\texecute: async (toolCallId, params, signal, onUpdate) => {\n' +
      '\t\t\tconst outcome = await runBeforeToolCallHook({\n' +
      '\t\t\t\ttoolName,\n' +
      '\t\t\t\tparams,\n' +
      '\t\t\t\ttoolCallId,\n' +
      '\t\t\t\tctx\n' +
      '\t\t\t});\n' +
      '\t\t\tif (outcome.blocked) throw new Error(outcome.reason);\n' +
      '\t\t\tconst _atc_start = Date.now();\n' +
      '\t\t\tlet _atc_result;\n' +
      '\t\t\tlet _atc_error;\n' +
      '\t\t\ttry {\n' +
      '\t\t\t\t_atc_result = await execute(toolCallId, outcome.params, signal, onUpdate);\n' +
      '\t\t\t} catch (err) {\n' +
      '\t\t\t\t_atc_error = err instanceof Error ? err.message : String(err);\n' +
      '\t\t\t\tthrow err;\n' +
      '\t\t\t} finally {\n' +
      '\t\t\t\tconst _atc_hr = getGlobalHookRunner();\n' +
      '\t\t\t\tif (_atc_hr?.hasHooks("after_tool_call")) {\n' +
      '\t\t\t\t\tvoid _atc_hr.runAfterToolCall(\n' +
      '\t\t\t\t\t\t{ toolName, params: (typeof outcome.params === "object" && outcome.params !== null && !Array.isArray(outcome.params)) ? outcome.params : {}, result: _atc_result, error: _atc_error, durationMs: Date.now() - _atc_start },\n' +
      '\t\t\t\t\t\t{ toolName, agentId: ctx?.agentId, sessionKey: ctx?.sessionKey }\n' +
      '\t\t\t\t\t).catch((e) => console.warn(`after_tool_call hook failed: tool=${toolName} error=${String(e)}`));\n' +
      '\t\t\t\t}\n' +
      '\t\t\t}\n' +
      '\t\t\treturn _atc_result;\n' +
      '\t\t}\n' +
      '\t};\n' +
      '}',
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Recursively collect all .js files under a directory (skip node_modules, max depth 6). */
function collectJs(dir, depth = 0) {
  if (depth > 6) return [];
  let results = [];
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch { return []; }
  for (const e of entries) {
    if (e.isSymbolicLink()) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules') continue;
      results = results.concat(collectJs(full, depth + 1));
    } else if (e.isFile() && e.name.endsWith('.js')) {
      results.push(full);
    }
  }
  return results;
}

/** Find the openclaw npm package root inside a pnpm store. */
function findOpenClawPkg(base) {
  const pnpm = path.join(base, 'node_modules', '.pnpm');
  if (!fs.existsSync(pnpm)) return null;
  let entries;
  try { entries = fs.readdirSync(pnpm).filter(e => e.startsWith('openclaw@')); }
  catch { return null; }
  if (entries.length === 0) return null;
  entries.sort((a, b) => b.localeCompare(a));
  return path.join(pnpm, entries[0], 'node_modules', 'openclaw');
}

/** Delete a file, silently ignore if it doesn't exist. */
function tryDelete(p) {
  try { fs.unlinkSync(p); return true; }
  catch { return false; }
}

// ── Strategy A: source-level patching ────────────────────────────────────────

function trySourcePatch() {
  const missing = SOURCE_PATCHES
    .map(p => path.join(openclaw_dir, p.file))
    .filter(f => !fs.existsSync(f));

  if (missing.length > 0) {
    if (verbose) console.log('Source files not found (will try bundle fallback):');
    if (verbose) missing.forEach(f => console.log(`  missing: ${f}`));
    return false;
  }

  console.log('\nStrategy A: patching OpenClaw TypeScript source');
  let patched = 0;
  let already  = 0;

  for (const p of SOURCE_PATCHES) {
    const file = path.join(openclaw_dir, p.file);
    const original = fs.readFileSync(file, 'utf8');

    if (original.includes(p.sentinel)) {
      already++;
      if (verbose) console.log(`  ok     ${p.file}`);
      continue;
    }
    if (!original.includes(p.needle)) {
      console.error(`  ERROR  ${p.file} — needle not found. OpenClaw version may be incompatible.`);
      console.error(`         Expected to find:\n${p.needle.split('\n').map(l => '           ' + l).join('\n')}`);
      process.exit(1);
    }

    if (dry_run) {
      console.log(`  [dry-run] patch ${p.file}`);
    } else {
      fs.writeFileSync(file, original.replace(p.needle, p.replacement), 'utf8');
      console.log(`  patch  ${p.file}`);
    }
    patched++;
  }

  console.log(`  source: patched=${patched} already-ok=${already}`);

  // Delete stale hashed bundles that contain the old hook dispatch so OpenClaw
  // rebuilds them fresh from the patched source.
  const dist_dir = path.join(openclaw_dir, 'dist');
  if (fs.existsSync(dist_dir) && !dry_run) {
    console.log('\n  Deleting stale bundles (will be regenerated by pnpm tsdown)...');
    const stale = collectJs(dist_dir, 0).filter(f => {
      try { return fs.readFileSync(f, 'utf8').includes('runBeforeAgentStart'); }
      catch { return false; }
    });
    let deleted = 0;
    for (const f of stale) {
      if (tryDelete(f)) {
        deleted++;
        if (verbose) console.log(`  deleted ${path.relative(dist_dir, f)}`);
      }
    }
    console.log(`  deleted ${deleted} stale bundle file(s)`);
  }

  // Rebuild OpenClaw bundles
  if (!no_rebuild && !dry_run) {
    const tsdown = path.join(openclaw_dir, 'node_modules', '.bin', 'tsdown');
    if (!fs.existsSync(tsdown)) {
      console.warn('  WARNING: tsdown not found at ' + tsdown);
      console.warn('           Run `pnpm tsdown` manually in ' + openclaw_dir + ' before restarting OpenClaw.');
      return true;
    }
    console.log('\n  Rebuilding OpenClaw bundles (pnpm tsdown)...');
    try {
      execSync(`"${tsdown}"`, { cwd: openclaw_dir, stdio: 'inherit' });
      console.log('  Rebuild complete');
    } catch (err) {
      console.error('  ERROR: tsdown rebuild failed. Run `pnpm tsdown` manually in ' + openclaw_dir);
      process.exit(1);
    }
  } else if (no_rebuild) {
    console.log('  --no-rebuild: skipping tsdown. Run `pnpm tsdown` in ' + openclaw_dir + ' before restarting OpenClaw.');
  }

  return true;
}

// ── Strategy B: bundle-level patching (fallback) ──────────────────────────────

function bundleFallback() {
  console.log('\nStrategy B: patching compiled .js bundles (source not available)');
  console.warn('  WARNING: bundle patches break when OpenClaw rebuilds its bundles.');
  console.warn('           Re-run this script after each OpenClaw update.');

  // Directories to scan
  const scan_dirs = [];

  const oc_dist = path.join(openclaw_dir, 'dist');
  if (fs.existsSync(oc_dist)) {
    scan_dirs.push({ dir: oc_dist, label: 'openclaw/dist' });
  }

  const oc_pkg = findOpenClawPkg(openclaw_dir);
  if (oc_pkg) scan_dirs.push({ dir: path.join(oc_pkg, 'dist'), label: 'openclaw-pkg(source)/dist' });

  const script_dir = path.dirname(new URL(import.meta.url).pathname);
  const plugin_src_pkg = findOpenClawPkg(path.resolve(script_dir, '..'));
  if (plugin_src_pkg) scan_dirs.push({ dir: path.join(plugin_src_pkg, 'dist'), label: 'openclaw-pkg(plugin-src)/dist' });

  if (plugin_dir && fs.existsSync(path.join(plugin_dir, 'node_modules'))) {
    const deployed_pkg = findOpenClawPkg(plugin_dir);
    if (deployed_pkg) scan_dirs.push({ dir: path.join(deployed_pkg, 'dist'), label: 'openclaw-pkg(deployed)/dist' });
  }

  if (scan_dirs.length === 0) {
    console.error('  ERROR: No dist directories found to patch.');
    console.error('         Set --openclaw-dir to the OpenClaw root directory.');
    process.exit(1);
  }

  let total_patched  = 0;
  let total_already  = 0;
  let total_no_match = 0;

  for (const { dir, label } of scan_dirs) {
    const files = collectJs(dir);
    if (verbose) console.log(`\n  Scanning [${label}] — ${files.length} JS files`);

    for (const file of files) {
      let original;
      try { original = fs.readFileSync(file, 'utf8'); }
      catch { continue; }

      let content   = original;
      let f_patched = 0;
      let f_already = 0;

      for (const p of BUNDLE_PATCHES) {
        if (content.includes(p.sentinel)) { f_already++; continue; }
        if (!content.includes(p.needle))  { continue; }
        content = content.replace(p.needle, p.replacement);
        f_patched++;
        if (dry_run) {
          console.log(`  [dry-run] ${path.relative(dir, file)} — ${p.name}`);
        } else {
          console.log(`  patch    ${path.relative(dir, file)} — ${p.name}`);
        }
      }

      if (f_patched > 0) {
        total_patched += f_patched;
        if (!dry_run) fs.writeFileSync(file, content, 'utf8');
      } else if (f_already > 0) {
        total_already += f_already;
        if (verbose) console.log(`  ok       ${path.relative(dir, file)}`);
      } else {
        total_no_match++;
      }
    }
  }

  console.log(`\n  bundles: patched=${total_patched} already-ok=${total_already} no-match=${total_no_match}`);

  if (total_patched === 0 && total_already === 0) {
    console.error('\nERROR: No matching patterns found in any bundle.');
    console.error('       This may mean OpenClaw changed its code structure.');
    console.error('       Check --openclaw-dir points to the OpenClaw root and verify');
    console.error('       the installed OpenClaw version is compatible with this plugin.');
    process.exit(1);
  }
}

// ── Run ───────────────────────────────────────────────────────────────────────

const used_source = trySourcePatch();
if (!used_source) bundleFallback();

console.log('\nDone.');
