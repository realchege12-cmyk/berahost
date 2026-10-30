import { parseDocument } from "yaml";

export type WebProjectType = "static" | "service";

export type WebManifest = {
  version: 1;
  project: {
    type: WebProjectType;
    root: string;
  };
  install?: string;
  build?: string;
  output?: string;
  start?: string;
  service?: {
    port?: number;
    health_path?: string;
  };
};

export type DetectedWebProjectConfig = {
  projectRoot?: string;
  installCommand?: string;
  buildCommand?: string;
  startCommand?: string;
  outputDirectory?: string;
  servicePort?: number;
  healthPath?: string;
};

export type WebProjectOverrides = Partial<DetectedWebProjectConfig>;

export type ResolvedWebProjectConfig = {
  type: WebProjectType;
  projectRoot: string;
  installCommand: string;
  buildCommand: string;
  startCommand: string;
  outputDirectory: string;
  servicePort: number;
  healthPath: string;
  configSource: "berahost.yml" | "auto-detected";
};

const MAX_MANIFEST_BYTES = 32 * 1024;
const MAX_COMMAND_LENGTH = 1000;
const KNOWN_TOP_LEVEL = new Set(["version", "project", "install", "build", "output", "start", "service"]);
const KNOWN_PROJECT_KEYS = new Set(["type", "root"]);
const KNOWN_SERVICE_KEYS = new Set(["port", "health_path"]);

export class WebManifestError extends Error {
  readonly code = "INVALID_BERAHOST_YML";
}

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new WebManifestError(`${label} must be a mapping.`);
  }
  return value as Record<string, unknown>;
}

function rejectUnknownKeys(value: Record<string, unknown>, allowed: Set<string>, label: string): void {
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length) throw new WebManifestError(`${label} has unsupported field${unknown.length > 1 ? "s" : ""}: ${unknown.join(", " )}.`);
}

function relativePath(value: unknown, label: string, fallback = "."): string {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value !== "string") throw new WebManifestError(`${label} must be a relative path.`);
  const normalized = value.trim().replace(/\\/g, "/");
  if (!normalized || normalized.startsWith("/") || /^[A-Za-z]:/.test(normalized) || normalized.includes("\0")) {
    throw new WebManifestError(`${label} must be a relative path inside the repository.`);
  }
  const segments = normalized.split("/").filter((part) => part && part !== ".");
  if (segments.some((part) => part === ".." || part === "~")) {
    throw new WebManifestError(`${label} cannot escape the repository with '..' or '~'.`);
  }
  return segments.join("/") || ".";
}

function commandValue(value: unknown, label: string): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") throw new WebManifestError(`${label} must be a command string.`);
  const command = value.trim();
  if (!command || command.length > MAX_COMMAND_LENGTH || /[\0\r\n]/.test(command)) {
    throw new WebManifestError(`${label} must be a single-line command of at most ${MAX_COMMAND_LENGTH} characters.`);
  }
  return command;
}

function healthPathValue(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") throw new WebManifestError("service.health_path must be a URL path starting with '/'.");
  const healthPath = value.trim();
  if (!healthPath.startsWith("/") || healthPath.startsWith("//") || healthPath.includes("..") || /[\0\r\n?#]/.test(healthPath) || healthPath.length > 256) {
    throw new WebManifestError("service.health_path must be a safe URL path starting with '/' (maximum 256 characters). ");
  }
  return healthPath;
}

/** Parse the intentionally small, safe BERAHOST manifest subset. Commands are data; callers must execute them only in the isolated workload environment. */
export function parseBerahostYml(source: string): WebManifest {
  if (typeof source !== "string" || Buffer.byteLength(source, "utf8") > MAX_MANIFEST_BYTES) {
    throw new WebManifestError(`berahost.yml must be smaller than ${MAX_MANIFEST_BYTES} bytes.`);
  }
  let document;
  try {
    document = parseDocument(source, { uniqueKeys: true, schema: "core" });
  } catch {
    throw new WebManifestError("berahost.yml could not be parsed as YAML.");
  }
  if (document.errors.length) throw new WebManifestError(`berahost.yml syntax error: ${document.errors[0].message}`);
  let parsed: unknown;
  try {
    parsed = document.toJS({ maxAliasCount: 10 });
  } catch {
    throw new WebManifestError("berahost.yml contains unsupported YAML aliases or values.");
  }
  const root = objectValue(parsed, "berahost.yml");
  rejectUnknownKeys(root, KNOWN_TOP_LEVEL, "berahost.yml");
  if (root.version !== 1) throw new WebManifestError("berahost.yml must declare version: 1.");

  const project = objectValue(root.project, "project");
  rejectUnknownKeys(project, KNOWN_PROJECT_KEYS, "project");
  if (project.type !== "static" && project.type !== "service") {
    throw new WebManifestError("project.type must be either 'static' or 'service'. Choose one deployment type.");
  }
  const type = project.type;
  const projectRoot = relativePath(project.root, "project.root");
  const install = commandValue(root.install, "install");
  const build = commandValue(root.build, "build");
  const start = commandValue(root.start, "start");
  const output = root.output === undefined ? undefined : relativePath(root.output, "output");

  let service: WebManifest["service"];
  if (root.service !== undefined) {
    const config = objectValue(root.service, "service");
    rejectUnknownKeys(config, KNOWN_SERVICE_KEYS, "service");
    let port: number | undefined;
    if (config.port !== undefined) {
      if (!Number.isInteger(config.port) || Number(config.port) < 1 || Number(config.port) > 65535) {
        throw new WebManifestError("service.port must be an integer from 1 to 65535.");
      }
      port = Number(config.port);
    }
    service = { port, health_path: healthPathValue(config.health_path) };
  }

  if (type === "static" && (start || service)) {
    throw new WebManifestError("A static site cannot declare start or service settings. Choose either static or service.");
  }
  if (type === "service" && output) {
    throw new WebManifestError("A web service cannot declare output; output is only for static sites.");
  }

  return {
    version: 1,
    project: { type, root: projectRoot },
    ...(install ? { install } : {}),
    ...(build ? { build } : {}),
    ...(output ? { output } : {}),
    ...(start ? { start } : {}),
    ...(service ? { service } : {}),
  };
}

/** Dashboard values override manifest values; manifest values override automatic detection. The selected type must agree with the manifest. */
export function resolveWebProjectConfig(args: {
  selectedType: WebProjectType;
  manifest?: WebManifest | null;
  detected?: DetectedWebProjectConfig;
  overrides?: WebProjectOverrides;
}): ResolvedWebProjectConfig {
  const { selectedType, manifest, detected = {}, overrides = {} } = args;
  if (selectedType !== "static" && selectedType !== "service") {
    throw new WebManifestError("Choose either Static Site or Web Service before deploying.");
  }
  if (manifest && manifest.project.type !== selectedType) {
    throw new WebManifestError(`berahost.yml declares '${manifest.project.type}', but you selected '${selectedType}'. Make them match and retry.`);
  }
  const projectRoot = overrides.projectRoot || manifest?.project.root || detected.projectRoot || ".";
  const installCommand = overrides.installCommand || manifest?.install || detected.installCommand || "";
  const buildCommand = overrides.buildCommand || manifest?.build || detected.buildCommand || "";
  const startCommand = selectedType === "service"
    ? overrides.startCommand || manifest?.start || detected.startCommand || ""
    : "";
  const outputDirectory = selectedType === "static"
    ? overrides.outputDirectory || manifest?.output || detected.outputDirectory || ""
    : "";
  if (selectedType === "service" && !startCommand) {
    throw new WebManifestError("No service start command was detected. Add start to berahost.yml or enter one in the dashboard.");
  }
  if (selectedType === "static" && !outputDirectory) {
    throw new WebManifestError("No static output directory was detected. Add output to berahost.yml or select the output directory.");
  }
  const servicePort = selectedType === "service" ? overrides.servicePort || manifest?.service?.port || detected.servicePort || 3000 : 0;
  const healthPath = selectedType === "service" ? overrides.healthPath || manifest?.service?.health_path || detected.healthPath || "/" : "";
  return {
    type: selectedType,
    projectRoot,
    installCommand,
    buildCommand,
    startCommand,
    outputDirectory,
    servicePort,
    healthPath,
    configSource: manifest ? "berahost.yml" : "auto-detected",
  };
}
