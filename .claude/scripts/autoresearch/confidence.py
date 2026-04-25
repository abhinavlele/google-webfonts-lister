#!/usr/bin/env python3
"""autoresearch/confidence.py — MAD-based confidence scoring for an iteration.

Reads autoresearch.jsonl (default ./autoresearch.jsonl), splits baseline vs.
candidate samples, computes the baseline median + MAD, and reports whether the
candidate's metric beats the baseline beyond benchmark noise.

Outputs JSON on stdout:
    {
      "baseline_count": int,
      "baseline_median": float|null,
      "mad": float|null,
      "candidate_value": float|null,
      "delta": float|null,
      "normalized_z": float|null,
      "confidence_pct": float|null,
      "direction": "min"|"max",
      "direction_aligned": bool|null,
      "decision": "keep"|"revert"|"insufficient_data"
    }

Confidence formula:
    confidence_pct = 1 - exp(-|delta| / (1.4826 * mad))   clamped to [0, 1]

Decision: keep iff direction_aligned and confidence_pct >= threshold.
"""

import argparse
import json
import math
import pathlib
import sys
from typing import Optional


def median(values):
    s = sorted(values)
    n = len(s)
    if n == 0:
        return None
    mid = n // 2
    return s[mid] if n % 2 else (s[mid - 1] + s[mid]) / 2.0


def mad(values, med: float) -> float:
    if not values:
        return 0.0
    return median([abs(v - med) for v in values]) or 0.0


def read_frontmatter(md_path: pathlib.Path) -> dict:
    if not md_path.exists():
        return {}
    text = md_path.read_text()
    parts = text.split("---", 2)
    if len(parts) < 3:
        return {}
    try:
        return json.loads(parts[1])
    except json.JSONDecodeError:
        return {}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--jsonl", default="./autoresearch.jsonl")
    ap.add_argument("--md", default="./autoresearch.md")
    ap.add_argument("--iter", type=int, default=None,
                    help="iteration to score; defaults to latest candidate iter in the log")
    ap.add_argument("--threshold", type=float, default=None,
                    help="overrides threshold from autoresearch.md frontmatter")
    args = ap.parse_args()

    jsonl_path = pathlib.Path(args.jsonl)
    md_path = pathlib.Path(args.md)
    if not jsonl_path.exists():
        print(json.dumps({"error": f"no jsonl at {jsonl_path}"}))
        return 2

    fm = read_frontmatter(md_path)
    direction = fm.get("direction", "min")
    threshold = args.threshold if args.threshold is not None else float(fm.get("threshold", 0.80))

    baseline_vals = []
    candidate_by_iter: dict[int, list[float]] = {}
    for line in jsonl_path.read_text().splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            row = json.loads(line)
        except json.JSONDecodeError:
            continue
        metric = row.get("metric")
        if metric is None or not isinstance(metric, (int, float)):
            continue
        role = row.get("role")
        if role == "baseline":
            baseline_vals.append(float(metric))
        elif role == "candidate":
            candidate_by_iter.setdefault(int(row.get("iter", 0)), []).append(float(metric))

    iter_ = args.iter
    if iter_ is None:
        iter_ = max(candidate_by_iter) if candidate_by_iter else None

    candidate_value: Optional[float] = None
    if iter_ is not None and iter_ in candidate_by_iter:
        candidate_value = median(candidate_by_iter[iter_])

    out = {
        "baseline_count": len(baseline_vals),
        "baseline_median": None,
        "mad": None,
        "candidate_value": candidate_value,
        "delta": None,
        "normalized_z": None,
        "confidence_pct": None,
        "direction": direction,
        "direction_aligned": None,
        "decision": "insufficient_data",
        "iter": iter_,
        "threshold": threshold,
    }

    if len(baseline_vals) < 2 or candidate_value is None:
        print(json.dumps(out))
        return 0

    base_med = median(baseline_vals)
    base_mad = mad(baseline_vals, base_med)
    delta = candidate_value - base_med
    direction_aligned = (delta < 0) if direction == "min" else (delta > 0)

    sigma = 1.4826 * base_mad
    if sigma <= 0:
        confidence_pct = 1.0 if delta != 0 else 0.0
        normalized_z = None  # undefined when baseline has zero variance
    else:
        normalized_z = abs(delta) / sigma
        confidence_pct = max(0.0, min(1.0, 1.0 - math.exp(-normalized_z)))

    decision = "keep" if (direction_aligned and confidence_pct >= threshold) else "revert"

    out.update({
        "baseline_median": base_med,
        "mad": base_mad,
        "delta": delta,
        "normalized_z": normalized_z,
        "confidence_pct": confidence_pct,
        "direction_aligned": direction_aligned,
        "decision": decision,
    })
    print(json.dumps(out))
    return 0


if __name__ == "__main__":
    sys.exit(main())
