"""Run the synthetic input-quality benchmark: python tools/benchmark_inputs.py [first_seed] [count]. Logic lives in wattloop/benchmark.py."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from wattloop import benchmark  # noqa: E402

if __name__ == "__main__":
    first = int(sys.argv[1]) if len(sys.argv) > 1 else 1000
    count = int(sys.argv[2]) if len(sys.argv) > 2 else 200
    for m, s in benchmark.run(first, count).items():
        print(f"{m:14s} n={s['n']:3d}  median error of predicted saving {s['median']:5.1f}%   mean {s['mean']:5.1f}%   90th pct {s['p90']:5.1f}%")
