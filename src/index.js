#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const HTTP_METHODS = new Set(["get", "post", "put", "patch", "delete"]);
const LOW_CONFIDENCE_KEYWORDS = [
  "admin",
  "cron",
  "external",
  "internal",
  "job",
  "mobile",
  "public-api",
  "scheduler",
  "swagger",
  "webhook",
];

function parseArgs(argv) {
  const args = {
    backend: ["server.js"],
    frontend: ["frontend"],
    out: "reports",
    root: process.cwd(),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];

    if (key === "--backend" && value) {
      args.backend = value.split(",").map((item) => item.trim());
      index += 1;
    } else if (key === "--frontend" && value) {
      args.frontend = value.split(",").map((item) => item.trim());
      index += 1;
    } else if (key === "--out" && value) {
      args.out = value;
      index += 1;
    }
  }

  return args;
}

function walkFiles(root, entries) {
  const files = [];

  for (const entry of entries) {
    const absolute = path.resolve(root, entry);
    if (!fs.existsSync(absolute)) {
      continue;
    }

    const stat = fs.statSync(absolute);
    if (stat.isDirectory()) {
      for (const child of fs.readdirSync(absolute)) {
        if (shouldSkipPath(child)) {
          continue;
        }
        files.push(...walkFiles(root, [path.join(entry, child)]));
      }
    } else if (!shouldSkipPath(entry)) {
      files.push(path.normalize(entry));
    }
  }

  return files;
}

function shouldSkipPath(filePath) {
  const parts = filePath.split(path.sep);
  return (
    parts.includes("node_modules") ||
    parts.includes("reports") ||
    parts.includes("cross-prune-test") ||
    parts.includes(".git") ||
    filePath.endsWith("package-lock.json")
  );
}

function readFile(root, relativePath) {
  return fs.readFileSync(path.resolve(root, relativePath), "utf8");
}

function lineNumberAt(content, index) {
  return content.slice(0, index).split("\n").length;
}

function findCallExpression(content, startIndex) {
  const openParenIndex = content.indexOf("(", startIndex);
  let depth = 0;
  let quote = null;
  let escaped = false;

  for (let index = openParenIndex; index < content.length; index += 1) {
    const character = content[index];

    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === quote) {
        quote = null;
      }
      continue;
    }

    if (character === "\"" || character === "'" || character === "`") {
      quote = character;
    } else if (character === "(") {
      depth += 1;
    } else if (character === ")") {
      depth -= 1;
      if (depth === 0) {
        return content.slice(startIndex, index + 1);
      }
    }
  }

  return content.slice(startIndex);
}

function normalizePath(rawPath) {
  if (!rawPath) {
    return rawPath;
  }

  let cleanPath = rawPath.replace(/^https?:\/\/[^/]+/i, "");
  cleanPath = cleanPath.split("?")[0].split("#")[0];
  cleanPath = cleanPath.replace(/\/+/g, "/");
  if (!cleanPath.startsWith("/")) {
    cleanPath = `/${cleanPath}`;
  }
  if (cleanPath.length > 1) {
    cleanPath = cleanPath.replace(/\/+$/, "");
  }
  return cleanPath;
}

function normalizeFrontendPath(rawPath) {
  return normalizePath(rawPath.replace(/\$\{[^}]+\}/g, "*"));
}

function joinPaths(prefix, routePath) {
  return normalizePath(`${prefix || ""}/${routePath || ""}`);
}

function routeMatchesCall(routePath, callPath) {
  const routeParts = normalizePath(routePath).split("/").filter(Boolean);
  const callParts = normalizeFrontendPath(callPath).split("/").filter(Boolean);

  if (routeParts.length !== callParts.length) {
    return false;
  }

  return routeParts.every((part, index) => {
    const callPart = callParts[index];
    return part.startsWith(":") || callPart === "*" || part === callPart;
  });
}

function collectBackendRoutes(root, backendEntries) {
  const files = walkFiles(root, backendEntries).filter((file) => file.endsWith(".js"));
  const routes = [];

  for (const file of files) {
    const content = readFile(root, file);
    const lines = content.split("\n");
    const routerPrefixes = collectRouterPrefixes(content);
    const routePattern =
      /\b([A-Za-z_$][\w$]*)\.(get|post|put|patch|delete)\(\s*["'`]([^"'`]+)["'`]/g;
    let match;

    while ((match = routePattern.exec(content)) !== null) {
      const owner = match[1];
      const method = match[2].toUpperCase();
      const rawPath = match[3];
      const startLine = lineNumberAt(content, match.index);
      const endLine = findBlockEndLine(lines, startLine);
      const prefix = owner === "app" ? "" : routerPrefixes[owner] || "";

      routes.push({
        id: `${method} ${joinPaths(prefix, rawPath)}`,
        method,
        path: joinPaths(prefix, rawPath),
        rawPath,
        owner,
        file,
        startLine,
        endLine,
        block: lines.slice(startLine - 1, endLine).join("\n"),
      });
    }
  }

  return routes;
}

function collectRouterPrefixes(content) {
  const prefixes = {};
  const routerNames = new Set();
  const routerPattern =
    /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*express\.Router\(\)/g;
  let match;

  while ((match = routerPattern.exec(content)) !== null) {
    routerNames.add(match[1]);
  }

  const appUsePattern =
    /\bapp\.use\(\s*["'`]([^"'`]+)["'`]\s*,\s*([A-Za-z_$][\w$]*)\s*\)/g;
  while ((match = appUsePattern.exec(content)) !== null) {
    if (routerNames.has(match[2])) {
      prefixes[match[2]] = normalizePath(match[1]);
    }
  }

  return prefixes;
}

function findBlockEndLine(lines, startLine) {
  for (let index = startLine; index < lines.length; index += 1) {
    if (lines[index].trim() === "});") {
      return index + 1;
    }
  }
  return startLine + 1;
}

function collectFrontendCalls(root, frontendEntries) {
  const files = walkFiles(root, frontendEntries).filter((file) => file.endsWith(".js"));
  const calls = [];

  for (const file of files) {
    const content = readFile(root, file);
    const axiosClients = collectAxiosClients(content);
    collectFetchCalls(content, file, calls);
    collectAxiosCalls(content, file, calls, "axios", "");

    for (const [client, baseUrl] of Object.entries(axiosClients)) {
      collectAxiosCalls(content, file, calls, client, baseUrl);
    }
  }

  return calls;
}

function collectFetchCalls(content, file, calls) {
  const fetchPattern = /\bfetch\(\s*(["'`])([^"'`]+)\1/g;
  let match;

  while ((match = fetchPattern.exec(content)) !== null) {
    const snippet = findCallExpression(content, match.index);
    const methodMatch = snippet.match(/method:\s*["'`]([A-Za-z]+)["'`]/);
    calls.push({
      type: "fetch",
      method: methodMatch ? methodMatch[1].toUpperCase() : "GET",
      path: normalizeFrontendPath(match[2]),
      rawPath: match[2],
      file,
      line: lineNumberAt(content, match.index),
    });
  }
}

function collectAxiosClients(content) {
  const clients = {};
  const createPattern =
    /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*axios\.create\(\s*\{[\s\S]*?baseURL:\s*(["'`])([^"'`]+)\2[\s\S]*?\}\s*\)/g;
  let match;

  while ((match = createPattern.exec(content)) !== null) {
    clients[match[1]] = normalizeFrontendPath(match[3]);
  }

  return clients;
}

function collectAxiosCalls(content, file, calls, clientName, baseUrl) {
  const callPattern = new RegExp(
    `\\b${escapeRegExp(clientName)}\\.(get|post|put|patch|delete)\\(\\s*(["'\`])([^"'\`]+)\\2`,
    "g",
  );
  let match;

  while ((match = callPattern.exec(content)) !== null) {
    calls.push({
      type: clientName === "axios" ? "axios" : "axios-client",
      method: match[1].toUpperCase(),
      path: joinPaths(baseUrl, match[3]),
      rawPath: match[3],
      file,
      line: lineNumberAt(content, match.index),
    });
  }
}

function matchRoutes(routes, calls) {
  return routes.map((route) => {
    const consumers = calls.filter(
      (call) =>
        call.method === route.method && routeMatchesCall(route.path, call.path),
    );
    return { ...route, consumers };
  });
}

function collectHiddenConsumerEvidence(root, route, backendEntries, frontendEntries) {
  const allFiles = walkFiles(root, ["."]);
  const ignored = new Set([
    ...walkFiles(root, backendEntries),
    ...walkFiles(root, frontendEntries),
  ]);
  const literalPath = normalizePath(route.path);
  const evidence = [];

  for (const file of allFiles) {
    if (ignored.has(file) || !isHiddenConsumerFile(file)) {
      continue;
    }

    const content = readFile(root, file);
    const index = content.indexOf(literalPath);
    if (index === -1) {
      continue;
    }

    const window = content.slice(Math.max(0, index - 120), index + 160);
    evidence.push({
      file,
      line: lineNumberAt(content, index),
      reason: hiddenReason(file, window),
      snippet: window.trim().replace(/\s+/g, " "),
    });
  }

  return evidence;
}

function isHiddenConsumerFile(file) {
  const lower = file.toLowerCase();
  return (
    lower.includes("test") ||
    lower.includes("spec") ||
    lower.includes("doc") ||
    lower.includes("readme") ||
    lower.includes("config") ||
    lower.includes("cron") ||
    lower.includes("job") ||
    lower.includes("scheduler") ||
    lower.includes("openapi") ||
    lower.includes("swagger") ||
    lower.endsWith(".md") ||
    lower.endsWith(".json") ||
    lower.endsWith(".yaml") ||
    lower.endsWith(".yml")
  );
}

function hiddenReason(file, text) {
  const lower = `${file}\n${text}`.toLowerCase();
  const keyword = LOW_CONFIDENCE_KEYWORDS.find((item) => lower.includes(item));
  return keyword ? `keyword:${keyword}` : "hidden-reference";
}

function confidenceFor(route, hiddenEvidence) {
  const routeText = route.path.toLowerCase();
  const routeKeyword = LOW_CONFIDENCE_KEYWORDS.find((item) =>
    routeText.includes(item),
  );
  const evidenceKeyword = hiddenEvidence.find((item) =>
    item.reason.startsWith("keyword:"),
  );

  if (routeKeyword || evidenceKeyword) {
    return "LOW";
  }
  if (hiddenEvidence.length > 0) {
    return "MEDIUM";
  }
  return "HIGH";
}

function collectFunctionDefinitions(root) {
  const files = walkFiles(root, ["."]).filter((file) => file.endsWith(".js"));
  const definitions = {};

  for (const file of files) {
    const content = readFile(root, file);
    const pattern = /\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g;
    let match;

    while ((match = pattern.exec(content)) !== null) {
      definitions[match[1]] = {
        file,
        line: lineNumberAt(content, match.index),
        publicExport: isPublicExport(root, file, match[1]),
      };
    }
  }

  return definitions;
}

function isPublicExport(root, file, functionName) {
  const packagePath = path.join(root, "package.json");
  const mainFile = fs.existsSync(packagePath)
    ? JSON.parse(fs.readFileSync(packagePath, "utf8")).main
    : "index.js";
  const basename = path.basename(file);
  const content = readFile(root, file);
  const exported = new RegExp(`\\b${functionName}\\b`).test(content) &&
    /module\.exports|exports\./.test(content);

  return exported && (file === mainFile || basename === "index.js");
}

function traceDependencies(root, matchedRoutes) {
  const definitions = collectFunctionDefinitions(root);
  const activeRoutes = matchedRoutes.filter((route) => route.consumers.length > 0);
  const orphanRoutes = matchedRoutes.filter((route) => route.consumers.length === 0);
  const dependencies = [];
  const ignored = new Set([
    "delete",
    "get",
    "json",
    "listen",
    "patch",
    "post",
    "put",
    "send",
    "status",
    "use",
  ]);

  for (const route of orphanRoutes) {
    const calls = Array.from(
      route.block.matchAll(/\b([A-Za-z_$][\w$]*)\s*\(/g),
      (match) => match[1],
    ).filter((name) => !ignored.has(name));

    for (const name of new Set(calls)) {
      const definition = definitions[name] || null;
      const usedByActiveRoute = activeRoutes.some((activeRoute) =>
        new RegExp(`\\b${name}\\b`).test(activeRoute.block),
      );
      const usedByOtherOrphanRoute = orphanRoutes.some(
        (orphanRoute) =>
          orphanRoute.id !== route.id &&
          new RegExp(`\\b${name}\\b`).test(orphanRoute.block),
      );
      const removable =
        Boolean(definition) &&
        !usedByActiveRoute &&
        !usedByOtherOrphanRoute &&
        !definition.publicExport;

      dependencies.push({
        route: route.id,
        name,
        definition,
        usedByActiveRoute,
        usedByOtherOrphanRoute,
        exportedForPublicUse: definition ? definition.publicExport : false,
        removable,
      });
    }
  }

  return dependencies;
}

function analyzeProject(options) {
  const root = options.root || process.cwd();
  const backend = options.backend || ["server.js"];
  const frontend = options.frontend || ["frontend"];
  const backendRoutes = collectBackendRoutes(root, backend);
  const frontendCalls = collectFrontendCalls(root, frontend);
  const matchedRoutes = matchRoutes(backendRoutes, frontendCalls);
  const orphanCandidates = matchedRoutes
    .filter((route) => route.consumers.length === 0)
    .map((route) => {
      const hiddenEvidence = collectHiddenConsumerEvidence(
        root,
        route,
        backend,
        frontend,
      );
      return {
        ...route,
        confidence: confidenceFor(route, hiddenEvidence),
        confidenceEvidence: hiddenEvidence,
      };
    });
  const routeOnlyDependencies = traceDependencies(root, matchedRoutes);
  const tokenContext = buildTokenContextSummary(root);
  const warnings = [];

  if (orphanCandidates.some((route) => route.confidence !== "HIGH")) {
    warnings.push("Some prune candidates have hidden-consumer evidence.");
  }

  return {
    generatedAt: new Date().toISOString(),
    backendManifest: backendRoutes,
    frontendCalls,
    matchedRoutes,
    orphanCandidates,
    routeOnlyDependencies,
    warnings,
    tokenContext,
    nextSteps: [
      "Review LOW and MEDIUM confidence candidates manually.",
      "Confirm external, mobile, webhook, admin, and scheduled consumers before pruning.",
      "Apply pruning in a separate patch and run project validation before committing.",
    ],
  };
}

function buildTokenContextSummary(root) {
  try {
    const { countTokens } = require("gpt-tokenizer/model/gpt-5-codex");
    const skillPath =
      process.env.CROSS_PRUNE_SKILL ||
      path.join(root, ".agents", "skills", "cross-prune", "SKILL.md");

    if (!fs.existsSync(skillPath)) {
      return null;
    }

    const skillText = fs.readFileSync(skillPath, "utf8");
    const taskText =
      "Scan this project for backend API routes with no frontend consumers. Stop with a pruning plan before editing.";
    const inlinePrompt = `${skillText}\n\nTask: ${taskText}`;
    const invocation = `Use $cross-prune to ${taskText}`;
    const inlinePromptTokens = countTokens(inlinePrompt);
    const invocationTokens = countTokens(invocation);
    const skillBodyTokens = countTokens(skillText);
    const totalLoadedContextTokens = skillBodyTokens + invocationTokens;

    return {
      tokenizer: "gpt-tokenizer/model/gpt-5-codex",
      skillPath: path.relative(root, skillPath),
      userPromptCompression: {
        inlinePromptTokens,
        invocationTokens,
        tokensReduced: inlinePromptTokens - invocationTokens,
        percentReduced:
          ((inlinePromptTokens - invocationTokens) / inlinePromptTokens) * 100,
      },
      totalLoadedContext: {
        inlinePromptTokens,
        loadedSkillAndInvocationTokens: totalLoadedContextTokens,
        tokensReduced: inlinePromptTokens - totalLoadedContextTokens,
        claimCostSavings: totalLoadedContextTokens < inlinePromptTokens,
      },
    };
  } catch (_error) {
    return null;
  }
}

function writeReports(root, outDir, report) {
  const absoluteOut = path.resolve(root, outDir);
  fs.mkdirSync(absoluteOut, { recursive: true });
  fs.writeFileSync(
    path.join(absoluteOut, "cross-prune-report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  fs.writeFileSync(
    path.join(absoluteOut, "CROSS_PRUNE_REPORT.md"),
    renderMarkdownReport(report),
  );
}

function renderMarkdownReport(report) {
  const lines = [
    "# CrossPrune Report",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "## Backend Manifest",
    ...report.backendManifest.map(
      (route) => `- ${route.id} (${route.file}:${route.startLine}-${route.endLine})`,
    ),
    "",
    "## Frontend Calls",
    ...report.frontendCalls.map(
      (call) => `- ${call.method} ${call.path} via ${call.type} (${call.file}:${call.line})`,
    ),
    "",
    "## Matched Routes",
    ...report.matchedRoutes.map((route) => {
      const consumers = route.consumers.length
        ? route.consumers
            .map((call) => `${call.method} ${call.path} ${call.file}:${call.line}`)
            .join(", ")
        : "none";
      return `- ${route.id}: ${consumers}`;
    }),
    "",
    "## Prune Candidates",
    ...report.orphanCandidates.map(
      (route) =>
        `- ${route.id} confidence=${route.confidence} evidence=${route.confidenceEvidence.length}`,
    ),
    "",
    "## Route-Only Dependencies",
    ...report.routeOnlyDependencies.map(
      (dependency) =>
        `- ${dependency.name} for ${dependency.route}: removable=${dependency.removable}`,
    ),
    "",
    "## Warnings",
    ...(report.warnings.length ? report.warnings.map((item) => `- ${item}`) : ["- none"]),
    "",
    "## User Prompt Compression",
  ];

  if (report.tokenContext) {
    lines.push(
      `- Inline prompt tokens: ${report.tokenContext.userPromptCompression.inlinePromptTokens}`,
      `- $cross-prune invocation tokens: ${report.tokenContext.userPromptCompression.invocationTokens}`,
      `- User prompt tokens reduced: ${report.tokenContext.userPromptCompression.tokensReduced.toFixed(0)} (${report.tokenContext.userPromptCompression.percentReduced.toFixed(1)}%)`,
      "",
      "## Total Loaded Context",
      `- Inline prompt tokens: ${report.tokenContext.totalLoadedContext.inlinePromptTokens}`,
      `- Loaded skill plus invocation tokens: ${report.tokenContext.totalLoadedContext.loadedSkillAndInvocationTokens}`,
      `- Total context tokens reduced: ${report.tokenContext.totalLoadedContext.tokensReduced}`,
      `- Cost-savings claim allowed: ${report.tokenContext.totalLoadedContext.claimCostSavings}`,
    );
  } else {
    lines.push("- Token context unavailable.");
  }

  lines.push(
    "",
    "## Rollback-Safe Prune Plan",
    "- Do not auto-delete.",
    "- Review candidates and dependencies.",
    "- Patch one route at a time.",
    "- Run validation after each prune.",
    "- Revert only the pruning patch if validation fails.",
    "",
    "## Next Steps",
    ...report.nextSteps.map((item) => `- ${item}`),
    "",
  );

  return `${lines.join("\n")}\n`;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (
    args.backend.length === 1 &&
    args.backend[0] === "server.js" &&
    !fs.existsSync(path.resolve(args.root, "server.js")) &&
    fs.existsSync(path.resolve(args.root, "fixtures", "server.js"))
  ) {
    args.backend = ["fixtures/server.js"];
  }
  if (
    args.frontend.length === 1 &&
    args.frontend[0] === "frontend" &&
    !fs.existsSync(path.resolve(args.root, "frontend")) &&
    fs.existsSync(path.resolve(args.root, "fixtures", "frontend"))
  ) {
    args.frontend = ["fixtures/frontend"];
  }
  const report = analyzeProject(args);
  writeReports(args.root, args.out, report);
  console.log(`CrossPrune report written to ${path.resolve(args.root, args.out)}`);
  console.log(`Prune candidates: ${report.orphanCandidates.length}`);
}

if (require.main === module) {
  main();
}

module.exports = {
  analyzeProject,
  collectBackendRoutes,
  collectFrontendCalls,
  matchRoutes,
  normalizeFrontendPath,
  normalizePath,
  routeMatchesCall,
  main,
  writeReports,
};
