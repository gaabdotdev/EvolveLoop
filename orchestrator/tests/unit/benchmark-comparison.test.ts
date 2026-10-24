import { describe, it, expect } from "vitest";
import {
  compareBenchmarkSamples,
  assertNotProviderTokens,
  E001_PROXY_SERIES,
  type BenchmarkSample,
} from "../../src/observability/benchmark-comparison.js";
import {
  evaluateBenchmarkRun,
  BENCHMARK_BLOCKERS,
  type EvaluateBenchmarkRunInput,
} from "../../src/observability/benchmark-run-gate.js";

describe("benchmark comparison and run gate (G2 - Phase B)", () => {
  it("classes diferentes não são comparáveis", () => {
    const sampleProvider: BenchmarkSample = {
      value: 1200,
      measurementClass: "dado_provider",
      producer: "http_client_adapter",
      label: "openai:tokens",
      corpusId: "corpus_alpha",
      taskId: "task_001",
    };

    const sampleLocal: BenchmarkSample = {
      value: 1190,
      measurementClass: "estimativa_local",
      producer: "http_client_adapter",
      label: "openai:tokens",
      corpusId: "corpus_alpha",
      taskId: "task_001",
    };

    const result = compareBenchmarkSamples(sampleProvider, sampleLocal);
    expect(result.comparable).toBe(false);
    expect(result.measurementClass).toBe("desconhecido");
    expect(result.delta).toBeUndefined();

    // proxy_experimental vs desconhecido
    const sampleUnknown: BenchmarkSample = {
      ...sampleLocal,
      measurementClass: "desconhecido",
    };
    const resultUnknown = compareBenchmarkSamples(sampleLocal, sampleUnknown);
    expect(resultUnknown.comparable).toBe(false);
    expect(resultUnknown.measurementClass).toBe("desconhecido");
    expect(resultUnknown.delta).toBeUndefined();

    // Atributo divergente (produtor diferente) também torna não comparável
    const sampleDiffProducer: BenchmarkSample = {
      ...sampleLocal,
      producer: "other_counter",
    };
    const resultDiffProducer = compareBenchmarkSamples(sampleLocal, sampleDiffProducer);
    expect(resultDiffProducer.comparable).toBe(false);
    expect(resultDiffProducer.measurementClass).toBe("desconhecido");
    expect(resultDiffProducer.delta).toBeUndefined();

    // Atributo vazio também torna não comparável
    const sampleEmptyLabel: BenchmarkSample = {
      ...sampleLocal,
      label: "   ",
    };
    const resultEmpty = compareBenchmarkSamples(sampleLocal, sampleEmptyLabel);
    expect(resultEmpty.comparable).toBe(false);
    expect(resultEmpty.measurementClass).toBe("desconhecido");
    expect(resultEmpty.delta).toBeUndefined();
  });

  it("mesmo produtor e label e corpus e task e classe proxy_experimental calcula delta", () => {
    const baseline: BenchmarkSample = {
      value: 1673,
      measurementClass: "proxy_experimental",
      producer: "catalog_harness.estimate_tokens",
      label: "PROXY:whitespace_split",
      corpusId: "corpus_e001",
      taskId: "task_catalog_eval",
    };

    const treatment: BenchmarkSample = {
      value: 382,
      measurementClass: "proxy_experimental",
      producer: "catalog_harness.estimate_tokens",
      label: "PROXY:whitespace_split",
      corpusId: "corpus_e001",
      taskId: "task_catalog_eval",
    };

    const result = compareBenchmarkSamples(baseline, treatment);
    expect(result.comparable).toBe(true);
    expect(result.measurementClass).toBe("proxy_experimental");
    // delta: b.value - a.value = 382 - 1673 = -1291
    expect(result.delta).toBe(-1291);

    // Sem conversão em custo (não deve expor atributos de custo)
    expect((result as Record<string, unknown>).cost).toBeUndefined();
    expect((result as Record<string, unknown>).estimated_cost).toBeUndefined();
    expect((result as Record<string, unknown>).actual_cost).toBeUndefined();

    // Positivo quando b > a
    const sampleA: BenchmarkSample = {
      ...baseline,
      value: 100,
    };
    const sampleB: BenchmarkSample = {
      ...baseline,
      value: 250,
    };
    const resultPos = compareBenchmarkSamples(sampleA, sampleB);
    expect(resultPos.comparable).toBe(true);
    expect(resultPos.delta).toBe(150);
  });

  it("E-001 não compara com dado_provider", () => {
    // Validação da série canônica imutável E001_PROXY_SERIES
    expect(E001_PROXY_SERIES.CONTROL).toBe(1673);
    expect(E001_PROXY_SERIES.T_SKILLS_5).toBe(382);
    expect(E001_PROXY_SERIES.T_SKILLS_10).toBe(789);
    expect(E001_PROXY_SERIES.T_TOKENS_40).toBe(1010);
    expect(E001_PROXY_SERIES.measurementClass).toBe("proxy_experimental");
    expect(E001_PROXY_SERIES.producer).toBe("catalog_harness.estimate_tokens");
    expect(E001_PROXY_SERIES.label).toBe("PROXY:whitespace_split");
    expect(Object.isFrozen(E001_PROXY_SERIES)).toBe(true);

    const providerSample: BenchmarkSample = {
      value: 500,
      measurementClass: "dado_provider",
      producer: "catalog_harness.estimate_tokens",
      label: "PROXY:whitespace_split",
      corpusId: "corpus_e001",
      taskId: "task_catalog_eval",
    };

    // assertNotProviderTokens rejeita dado_provider em qualquer posição
    expect(() => {
      assertNotProviderTokens("dado_provider");
    }).toThrowError(/Cannot compare E001_PROXY_SERIES with measurementClass 'dado_provider'/);

    expect(() => {
      assertNotProviderTokens(providerSample);
    }).toThrowError(/Cannot compare E001_PROXY_SERIES with measurementClass 'dado_provider'/);

    expect(() => {
      assertNotProviderTokens(E001_PROXY_SERIES, providerSample);
    }).toThrowError(/Cannot compare E001_PROXY_SERIES with measurementClass 'dado_provider'/);

    expect(() => {
      assertNotProviderTokens(providerSample, E001_PROXY_SERIES);
    }).toThrowError(/Cannot compare E001_PROXY_SERIES with measurementClass 'dado_provider'/);

    // Não rejeita quando comparado com proxy_experimental
    expect(() => {
      assertNotProviderTokens("proxy_experimental");
    }).not.toThrow();

    expect(() => {
      assertNotProviderTokens(E001_PROXY_SERIES, {
        measurementClass: "proxy_experimental",
      });
    }).not.toThrow();

    // Reconhece usage_source === "dado_provider" além de measurementClass
    const usageSourceProviderSample = {
      usage_source: "dado_provider",
    };
    expect(() => {
      assertNotProviderTokens(usageSourceProviderSample);
    }).toThrowError(/Cannot compare E001_PROXY_SERIES with measurementClass 'dado_provider'/);

    expect(() => {
      assertNotProviderTokens(E001_PROXY_SERIES, usageSourceProviderSample);
    }).toThrowError(/Cannot compare E001_PROXY_SERIES with measurementClass 'dado_provider'/);

    expect(() => {
      assertNotProviderTokens(usageSourceProviderSample, E001_PROXY_SERIES);
    }).toThrowError(/Cannot compare E001_PROXY_SERIES with measurementClass 'dado_provider'/);

    expect(() => {
      assertNotProviderTokens({ usage_source: "proxy_experimental" });
    }).not.toThrow();
  });

  it("o gate bloqueia quando treatmentId é NOT_DESIGNATED, sem tabela de preços, sem tiktoken, sem call site, e com productionConsumption NOT_MEASURED", () => {
    const blockedInput: EvaluateBenchmarkRunInput = {
      treatmentId: "NOT_DESIGNATED",
      priceTablePresent: false,
      tiktokenPresent: false,
      productionCallSiteProven: false,
      productionConsumption: "NOT_MEASURED",
    };

    const evaluation = evaluateBenchmarkRun(blockedInput);
    expect(evaluation.allowed).toBe(false);
    expect(evaluation.blockers.length).toBe(5);
    expect(evaluation.blockers).toContain(BENCHMARK_BLOCKERS.TREATMENT_NOT_DESIGNATED);
    expect(evaluation.blockers).toContain(BENCHMARK_BLOCKERS.PRICE_TABLE_ABSENT);
    expect(evaluation.blockers).toContain(BENCHMARK_BLOCKERS.TIKTOKEN_ABSENT);
    expect(evaluation.blockers).toContain(BENCHMARK_BLOCKERS.PRODUCTION_CALL_SITE_UNPROVEN);
    expect(evaluation.blockers).toContain(BENCHMARK_BLOCKERS.PRODUCTION_CONSUMPTION_NOT_MEASURED);

    // Também bloqueia se apenas um bloqueador estiver ativo
    const partialBlockInput: EvaluateBenchmarkRunInput = {
      treatmentId: "v24_experimental_arm",
      priceTablePresent: true,
      tiktokenPresent: true,
      productionCallSiteProven: true,
      productionConsumption: "NOT_MEASURED",
    };
    const partialEval = evaluateBenchmarkRun(partialBlockInput);
    expect(partialEval.allowed).toBe(false);
    expect(partialEval.blockers).toEqual([
      BENCHMARK_BLOCKERS.PRODUCTION_CONSUMPTION_NOT_MEASURED,
    ]);
  });

  it("o gate só devolve allowed true quando os cinco bloqueadores estão resolvidos no input do teste. Esse teste não executa benchmark", () => {
    const resolvedInput: EvaluateBenchmarkRunInput = {
      treatmentId: "treatment_v24_candidate_01",
      priceTablePresent: true,
      tiktokenPresent: true,
      productionCallSiteProven: true,
      productionConsumption: "measured_telemetry_dataset_20261024",
    };

    const evaluation = evaluateBenchmarkRun(resolvedInput);
    expect(evaluation.allowed).toBe(true);
    expect(evaluation.blockers).toEqual([]);
    expect(evaluation.blockers.length).toBe(0);
  });
});
