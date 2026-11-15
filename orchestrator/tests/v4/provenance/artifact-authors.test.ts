import { describe, expect, it } from "vitest";
import {
  ART,
  ARTIFACT_BYTES,
  ARTIFACT_SHA,
  EXEC,
  TASK,
  WORK,
  WORKER,
  appendAll,
  createWorld,
  draft,
  seedWorkCreated,
  validArtifact,
} from "./helpers.js";

describe("artifactAuthors", () => {
  it("returns the registration event and corroborated executor", async () => {
    const world = createWorld();
    world.artifacts.seed(validArtifact(), ARTIFACT_BYTES);
    await seedWorkCreated(world.ledger);
    await appendAll(world.ledger, [
      draft(
        "evt_artregis01",
        "artifact.registered",
        {
          artifact_id: ART,
          content: { sha256: ARTIFACT_SHA, size_bytes: ARTIFACT_BYTES.byteLength, media_type: "text/plain" },
        },
        { actor: { kind: "EXECUTOR", id: WORKER } },
      ),
    ]);

    const refs = await world.graph.artifactAuthors(ART);
    expect(refs).toContain("evt_artregis01");
    expect(refs).toContain(WORKER);
    expect(refs).not.toContain("chat:who-wrote-this");
  });

  it("platform registration without an executor origin returns the event only", async () => {
    const world = createWorld();
    world.artifacts.seed(validArtifact({ origin: { task_id: TASK, execution_id: EXEC } }), ARTIFACT_BYTES);
    await seedWorkCreated(world.ledger);
    await appendAll(world.ledger, [
      draft("evt_artregis01", "artifact.registered", {
        artifact_id: ART,
        content: { sha256: ARTIFACT_SHA, size_bytes: ARTIFACT_BYTES.byteLength, media_type: "text/plain" },
      }),
    ]);

    const refs = await world.graph.artifactAuthors(ART);
    expect(refs).toEqual(["evt_artregis01"]);
  });

  it("fail-closed: missing artifact, invalid id, unverified integrity", async () => {
    const world = createWorld();
    expect(await world.graph.artifactAuthors("art_doesnotexist1")).toEqual([]);
    expect(await world.graph.inspectArtifactAuthors("not-an-id")).toMatchObject({
      refs: [],
      closed: "invalid_id",
    });

    world.artifacts.seed(validArtifact({ integrity_status: "UNVERIFIED" }), ARTIFACT_BYTES);
    await seedWorkCreated(world.ledger);
    expect(await world.graph.inspectArtifactAuthors(ART)).toMatchObject({
      refs: [],
      closed: "artifact_integrity",
    });
  });

  it("fail-closed: content hash mismatch is not authorship", async () => {
    const world = createWorld();
    world.artifacts.seed(validArtifact(), ARTIFACT_BYTES);
    world.artifacts.verifyOverride.set(ARTIFACT_SHA, "MISMATCH");
    await seedWorkCreated(world.ledger);
    await appendAll(world.ledger, [
      draft(
        "evt_artregis01",
        "artifact.registered",
        { artifact_id: ART, content: { sha256: ARTIFACT_SHA, size_bytes: 1, media_type: "text/plain" } },
        { actor: { kind: "EXECUTOR", id: WORKER } },
      ),
    ]);

    const answer = await world.graph.inspectArtifactAuthors(ART);
    expect(answer.refs).toEqual([]);
    expect(answer.closed).toBe("hash_mismatch");
    expect(answer.refs).not.toContain(WORKER);
  });

  it("fail-closed: origin.executor_ref not corroborated by the registration actor", async () => {
    const world = createWorld();
    world.artifacts.seed(validArtifact(), ARTIFACT_BYTES);
    await seedWorkCreated(world.ledger);
    await appendAll(world.ledger, [
      draft("evt_artregis01", "artifact.registered", {
        artifact_id: ART,
        content: { sha256: ARTIFACT_SHA, size_bytes: ARTIFACT_BYTES.byteLength, media_type: "text/plain" },
      }),
    ]);

    const answer = await world.graph.inspectArtifactAuthors(ART);
    expect(answer.refs).toEqual([]);
    expect(answer.closed).toBe("uncorroborated_origin");
  });

  it("fail-closed: registration event missing from the log", async () => {
    const world = createWorld();
    world.artifacts.seed(validArtifact(), ARTIFACT_BYTES);
    await seedWorkCreated(world.ledger);

    const answer = await world.graph.inspectArtifactAuthors(ART);
    expect(answer.refs).toEqual([]);
    expect(answer.closed).toBe("decision_not_in_ledger");
  });

  it("fail-closed: event payload hash disagrees with the stored artifact", async () => {
    const world = createWorld();
    world.artifacts.seed(validArtifact(), ARTIFACT_BYTES);
    await seedWorkCreated(world.ledger);
    await appendAll(world.ledger, [
      draft(
        "evt_artregis01",
        "artifact.registered",
        {
          artifact_id: ART,
          content: { sha256: "aa".repeat(32), size_bytes: 1, media_type: "text/plain" },
        },
        { actor: { kind: "EXECUTOR", id: WORKER } },
      ),
    ]);

    const answer = await world.graph.inspectArtifactAuthors(ART);
    expect(answer.refs).toEqual([]);
    expect(answer.closed).toBe("hash_mismatch");
  });

  it("D17: does not treat a provider name as an author", async () => {
    const world = createWorld();
    world.artifacts.seed(
      validArtifact({ origin: { task_id: TASK, execution_id: EXEC } }),
      ARTIFACT_BYTES,
    );
    await seedWorkCreated(world.ledger);
    await appendAll(world.ledger, [
      draft("evt_artregis01", "artifact.registered", {
        artifact_id: ART,
        content: { sha256: ARTIFACT_SHA, size_bytes: ARTIFACT_BYTES.byteLength, media_type: "text/plain" },
        provider: "shadowed-skill",
      }),
    ]);

    const refs = await world.graph.artifactAuthors(ART);
    expect(refs).toEqual(["evt_artregis01"]);
    expect(refs).not.toContain("shadowed-skill");
  });
});
