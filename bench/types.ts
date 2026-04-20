export type BenchRow = {
  suite: string;
  variant: string;
  size: number;
  hz: number;
  p99ms: number;
  avgms: number;
};
