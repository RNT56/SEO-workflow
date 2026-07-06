export interface AgentBenchmarkMetric {
  name: string;
  value: number;
  unit: string;
}

export interface AgentBenchmarkResult {
  status: "not_configured" | "completed";
  metrics: AgentBenchmarkMetric[];
}

export function createEmptyBenchmark(): AgentBenchmarkResult {
  return { status: "not_configured", metrics: [] };
}
