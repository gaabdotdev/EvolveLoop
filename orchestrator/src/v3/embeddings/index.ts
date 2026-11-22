export {
  probeNomicEmbed,
  embedTexts,
  resolveOllamaBaseUrl,
  resolveNomicModelId,
  type EmbeddingProbeResult,
  type EmbedResult,
} from "./nomic-client.js";
export {
  hybridRetrieve,
  type HybridRetrieveResult,
  type RetrievalChunk,
} from "./hybrid-retrieve.js";
export {
  VectorIndexStore,
  VectorIndexError,
  type VectorIndexSnapshot,
  type VectorSearchResult,
} from "./vector-index.js";
