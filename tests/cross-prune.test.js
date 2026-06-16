const assert = require("node:assert/strict");
const path = require("node:path");
const {
  analyzeProject,
  normalizeFrontendPath,
  routeMatchesCall,
} = require("../src/index");

const projectRoot = path.resolve(__dirname, "..");
const report = analyzeProject({
  root: projectRoot,
  backend: ["fixtures/server.js"],
  frontend: ["fixtures/frontend"],
});

function routeId(method, routePath) {
  return `${method} ${routePath}`;
}

function byRoute(method, routePath) {
  return report.matchedRoutes.find(
    (route) => route.id === routeId(method, routePath),
  );
}

function candidate(method, routePath) {
  return report.orphanCandidates.find(
    (route) => route.id === routeId(method, routePath),
  );
}

function dep(name, method, routePath) {
  return report.routeOnlyDependencies.find(
    (dependency) =>
      dependency.name === name && dependency.route === routeId(method, routePath),
  );
}

const apiPrefix = "/api/";
const billingPath = apiPrefix + "billing";
const legacyPath = apiPrefix + "legacy-data";

assert.equal(normalizeFrontendPath("/api/users/1/status?include=activity/"), "/api/users/1/status");
assert.equal(routeMatchesCall("/api/users/:id/status", "/api/users/*/status"), true);
assert.equal(routeMatchesCall(billingPath, billingPath), true);

assert.equal(report.backendManifest.length, 9);
assert.equal(report.frontendCalls.length, 5);

assert.ok(byRoute("GET", apiPrefix + "users").consumers.length > 0);
assert.ok(byRoute("GET", apiPrefix + "users/:id/status").consumers.length > 0);
assert.ok(byRoute("POST", billingPath).consumers.length > 0);
assert.ok(byRoute("GET", apiPrefix + "projects").consumers.length > 0);
assert.ok(byRoute("GET", apiPrefix + "reports").consumers.length > 0);

assert.equal(byRoute("DELETE", billingPath).consumers.length, 0);
assert.ok(candidate("DELETE", billingPath));
assert.equal(candidate("DELETE", billingPath).confidence, "HIGH");

assert.ok(candidate("GET", apiPrefix + "audit-export"));
assert.equal(candidate("GET", apiPrefix + "audit-export").confidence, "MEDIUM");
assert.equal(
  candidate("GET", apiPrefix + "audit-export").confidenceEvidence[0].file,
  path.normalize("fixtures/docs/api.md"),
);

assert.ok(candidate("POST", apiPrefix + "webhook/events"));
assert.equal(candidate("POST", apiPrefix + "webhook/events").confidence, "LOW");

assert.ok(candidate("DELETE", legacyPath));
assert.equal(candidate("DELETE", legacyPath).confidence, "HIGH");

assert.equal(dep("getSharedAuditTrail", "DELETE", billingPath).removable, false);
assert.equal(dep("getSharedAuditTrail", "DELETE", billingPath).usedByActiveRoute, true);
assert.equal(dep("cleanOldDatabaseRecords", "DELETE", legacyPath).removable, true);
assert.equal(dep("cleanOldDatabaseRecords", "DELETE", legacyPath).usedByActiveRoute, false);

assert.ok(report.tokenContext);
assert.ok(report.tokenContext.userPromptCompression.tokensReduced > 0);
assert.equal(
  typeof report.tokenContext.totalLoadedContext.claimCostSavings,
  "boolean",
);

console.log("CrossPrune MVP test passed.");
console.log(`Backend routes: ${report.backendManifest.length}`);
console.log(`Frontend calls: ${report.frontendCalls.length}`);
console.log(`Prune candidates: ${report.orphanCandidates.length}`);
console.log(
  `User prompt compression: ${report.tokenContext.userPromptCompression.tokensReduced.toFixed(0)} tokens`,
);
console.log(
  `Total loaded context delta: ${report.tokenContext.totalLoadedContext.tokensReduced} tokens`,
);
