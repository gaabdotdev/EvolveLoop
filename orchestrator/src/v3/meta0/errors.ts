/**
 * Meta0 catalog errors — typed, fail-closed.
 */

export class Meta0Error extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "Meta0Error";
    this.code = code;
  }
}

export class DemoNotFoundError extends Meta0Error {
  constructor(demoId: string, demosDir: string) {
    super("DEMO_NOT_FOUND", `Demo "${demoId}" not found under ${demosDir}`);
    this.name = "DemoNotFoundError";
  }
}

export class DemoManifestInvalidError extends Meta0Error {
  readonly errors: string[];

  constructor(demoId: string, errors: string[]) {
    super(
      "DEMO_MANIFEST_INVALID",
      `Demo "${demoId}" failed DemoManifest validation: ${errors.join("; ")}`,
    );
    this.name = "DemoManifestInvalidError";
    this.errors = errors;
  }
}
