/**
 * EvolveLoop V2.5 - Unified Knowledge System (UKS Core)
 * Storage Core Module
 * 
 * Provides robust atomic disk persistence, path confinement,
 * SHA-256 cryptographic hashing, and .data/ workspace initialization.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";

export interface DataManifest {
    schema_version: string;
    initialized_at: string;
    updated_at: string;
    workspace_root: string;
    storage_engine: string;
    status: "INITIALIZED" | "ACTIVE" | "MAINTENANCE";
    file_hashes: Record<string, string>;
}

/**
 * Computes SHA-256 cryptographic hash of a given string or Buffer.
 */
export function computeSha256(content: string | Buffer): string {
    return crypto.createHash("sha256").update(content).digest("hex");
}

/**
 * Asserts that a target file path remains strictly confined within an authorized root directory.
 * Throws an Error if directory traversal is detected.
 * Returns the normalized absolute path.
 */
export function assertPathConfined(filePath: string, rootDir: string): string {
    const resolvedRoot = path.resolve(rootDir);
    const resolvedTarget = path.resolve(filePath);

    // Ensure root ends with separator for boundary matching (unless target equals root)
    const rootPrefix = resolvedRoot.endsWith(path.sep) ? resolvedRoot : `${resolvedRoot}${path.sep}`;

    if (resolvedTarget !== resolvedRoot && !resolvedTarget.startsWith(rootPrefix)) {
        throw new Error(
            `[-] SECURITY_PATH_TRAVERSAL_VIOLATION: Path '${resolvedTarget}' escapes authorized root '${resolvedRoot}'.`
        );
    }

    return resolvedTarget;
}

/**
 * Writes data to disk atomically using a transient temporary file followed by POSIX rename.
 * Guarantees zero partial/corrupted writes on crash or process interruption.
 */
export async function writeAtomicJson<T>(filePath: string, data: T): Promise<void> {
    const targetPath = path.resolve(filePath);
    const targetDir = path.dirname(targetPath);

    // Ensure directory exists
    await fs.promises.mkdir(targetDir, { recursive: true });

    // Generate unique temporary file in the same directory (crucial for same-filesystem atomic rename)
    const tempFile = path.join(targetDir, `.tmp-${crypto.randomUUID()}`);
    const serialized = JSON.stringify(data, null, 2);

    try {
        // Write to temporary file
        await fs.promises.writeFile(tempFile, serialized, { encoding: "utf8" });

        // Atomic rename (POSIX rename replaces destination atomically)
        await fs.promises.rename(tempFile, targetPath);
    } catch (err) {
        // Cleanup temp file on failure
        if (fs.existsSync(tempFile)) {
            try {
                await fs.promises.unlink(tempFile);
            } catch {
                // Ignore unlink error
            }
        }
        throw err;
    }
}

/**
 * Reads and parses a JSON file from disk.
 * Returns null if the file does not exist.
 * Throws if JSON syntax is invalid.
 */
export async function readJson<T>(filePath: string): Promise<T | null> {
    const targetPath = path.resolve(filePath);

    if (!fs.existsSync(targetPath)) {
        return null;
    }

    const raw = await fs.promises.readFile(targetPath, { encoding: "utf8" });
    return JSON.parse(raw) as T;
}

/**
 * Initializes the .data/ directory in the workspace root with an integrity manifest.
 */
export async function initializeDataDirectory(
    customDataDir?: string,
    workspaceRoot?: string
): Promise<{ dataDir: string; manifestPath: string; created: boolean }> {
    const root = path.resolve(workspaceRoot || process.cwd());
    const dataDir = path.resolve(customDataDir || path.join(root, ".data"));
    const manifestPath = path.join(dataDir, "integrity-manifest.json");

    assertPathConfined(dataDir, root);

    await fs.promises.mkdir(dataDir, { recursive: true });

    let created = false;
    let manifest = await readJson<DataManifest>(manifestPath);

    if (!manifest) {
        created = true;
        const now = new Date().toISOString();
        manifest = {
            schema_version: "2.5.0",
            initialized_at: now,
            updated_at: now,
            workspace_root: root,
            storage_engine: "UKS_STORAGE_CORE_ATOMIC",
            status: "INITIALIZED",
            file_hashes: {}
        };
        await writeAtomicJson(manifestPath, manifest);
    }

    return {
        dataDir,
        manifestPath,
        created
    };
}
