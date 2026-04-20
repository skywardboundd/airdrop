import { runDoubleClaimBench } from './doubleClaim.bench';
import { runProofBench } from './proof.bench';
import { writeReports } from './report';

async function main() {
  const proofRows = await runProofBench();
  const dcRows = await runDoubleClaimBench();
  const allRows = [...proofRows, ...dcRows];
  await writeReports(allRows);
  console.log('\nSaved reports in ./bench-results (json, csv, gas-like-report.md)');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
