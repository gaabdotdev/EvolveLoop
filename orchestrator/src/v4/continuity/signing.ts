/**
 * Wire M10 handle signing into M04 without putting PEM on the capsule path (R14).
 * V37SignaturePort.sign(private_key_pem) is intentionally not used here.
 */

import type { HandleSigningAdapter, KeyHandle } from "../adapters/v37/identity.js";
import type { CapsuleKeyLookup, CapsuleSigner } from "./types.js";

export function signerFromHandle(
  adapter: HandleSigningAdapter,
  handle: KeyHandle,
): { signer: CapsuleSigner; keys: CapsuleKeyLookup } {
  return {
    signer: {
      key_id: handle.key_id,
      sign: (manifest_sha256) => adapter.sign(handle, manifest_sha256),
    },
    keys: {
      publicKey: (key_id) => adapter.publicKey({ key_id }),
      verify: (pub, payload, sig) => adapter.verify(pub, payload, sig),
    },
  };
}
