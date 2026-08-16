export * from '../../../benchmarks/verify-ce-prompt-trace';

import { main } from '../../../benchmarks/verify-ce-prompt-trace';

if (import.meta.main) await main();
