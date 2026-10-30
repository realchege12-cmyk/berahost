import test from "node:test";
import assert from "node:assert/strict";
import { parseBerahostYml, resolveWebProjectConfig, WebManifestError } from "../src/lib/webProjectConfig.ts";

test("parses a static-site manifest", () => {
  const manifest = parseBerahostYml(`version: 1\nproject:\n  type: static\n  root: sites/docs\ninstall: npm ci\nbuild: npm run build\noutput: dist\n`);
  assert.equal(manifest.project.type, "static");
  assert.equal(manifest.project.root, "sites/docs");
  assert.equal(manifest.output, "dist");
});

test("parses a web-service manifest with an explicit port and health path", () => {
  const manifest = parseBerahostYml(`version: 1\nproject:\n  type: service\n  root: .\ninstall: npm ci\nstart: npm start\nservice:\n  port: 8080\n  health_path: /healthz\n`);
  assert.equal(manifest.project.type, "service");
  assert.equal(manifest.service?.port, 8080);
  assert.equal(manifest.service?.health_path, "/healthz");
});

test("rejects unknown manifest keys and repository path traversal", () => {
  assert.throws(() => parseBerahostYml(`version: 1\nproject:\n  type: static\noutput: ../outside\n`), WebManifestError);
  assert.throws(() => parseBerahostYml(`version: 1\nproject:\n  type: static\n  root: ../../outside\n`), WebManifestError);
  assert.throws(() => parseBerahostYml(`version: 1\nproject:\n  type: static\n  extra: true\n`), WebManifestError);
});

test("rejects duplicate YAML keys and static/service configuration conflicts", () => {
  assert.throws(() => parseBerahostYml(`version: 1\nversion: 1\nproject:\n  type: static\n`), WebManifestError);
  assert.throws(() => parseBerahostYml(`version: 1\nproject:\n  type: static\nstart: npm start\n`), WebManifestError);
  assert.throws(() => parseBerahostYml(`version: 1\nproject:\n  type: service\noutput: dist\n`), WebManifestError);
});

test("selected project type must match the repository manifest", () => {
  const manifest = parseBerahostYml(`version: 1\nproject:\n  type: static\noutput: dist\n`);
  assert.throws(() => resolveWebProjectConfig({ selectedType: "service", manifest }), /declares 'static'/);
});

test("dashboard overrides take precedence over manifest and detection", () => {
  const manifest = parseBerahostYml(`version: 1\nproject:\n  type: service\nstart: npm start\nservice:\n  port: 8080\n`);
  const config = resolveWebProjectConfig({
    selectedType: "service",
    manifest,
    detected: { startCommand: "node index.js", servicePort: 3000 },
    overrides: { startCommand: "node server.js", servicePort: 9090 },
  });
  assert.equal(config.startCommand, "node server.js");
  assert.equal(config.servicePort, 9090);
  assert.equal(config.configSource, "berahost.yml");
});

test("service deployment requires a start command", () => {
  assert.throws(() => resolveWebProjectConfig({ selectedType: "service" }), /No service start command/);
});
