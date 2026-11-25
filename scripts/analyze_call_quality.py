#!/usr/bin/env python3
"""Compare un seuil fixe et un EWMA sur des échantillons WebRTC labellisés."""
from __future__ import annotations
import argparse, csv, json, math, statistics, sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Iterable

REQUIRED_COLUMNS = {"call_id", "ts", "rtt_ms", "jitter_ms", "packet_loss_pct", "bitrate_kbps", "candidate_type", "degraded"}
CANDIDATE_TYPES = {"host", "srflx", "relay"}

@dataclass(frozen=True)
class Sample:
    call_id: str
    ts: datetime
    rtt_ms: float
    jitter_ms: float
    packet_loss_pct: float
    bitrate_kbps: int
    candidate_type: str
    degraded: bool

def _number(value: str, field: str, line: int) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"ligne {line}: {field} doit être numérique") from exc
    if not math.isfinite(parsed) or parsed < 0:
        raise ValueError(f"ligne {line}: {field} doit être fini et positif ou nul")
    return parsed

def _label(value: str, line: int) -> bool:
    normalized = value.strip().lower()
    if normalized in {"1", "true", "yes", "degraded"}: return True
    if normalized in {"0", "false", "no", "normal"}: return False
    raise ValueError(f"ligne {line}: degraded doit valoir 0/1 ou true/false")

def load_samples(path: Path) -> list[Sample]:
    with path.open("r", encoding="utf-8", newline="") as stream:
        reader = csv.DictReader(stream)
        missing = REQUIRED_COLUMNS - set(reader.fieldnames or [])
        if missing: raise ValueError(f"colonnes manquantes: {', '.join(sorted(missing))}")
        samples = []
        for line, row in enumerate(reader, start=2):
            call_id = (row.get("call_id") or "").strip()
            if not call_id: raise ValueError(f"ligne {line}: call_id est obligatoire")
            try:
                ts = datetime.fromisoformat((row.get("ts") or "").replace("Z", "+00:00"))
            except ValueError as exc:
                raise ValueError(f"ligne {line}: ts doit être une date ISO-8601") from exc
            if ts.tzinfo is None:
                raise ValueError(f"ligne {line}: ts doit inclure un fuseau horaire")
            rtt = _number(row.get("rtt_ms", ""), "rtt_ms", line)
            jitter = _number(row.get("jitter_ms", ""), "jitter_ms", line)
            loss = _number(row.get("packet_loss_pct", ""), "packet_loss_pct", line)
            bitrate = _number(row.get("bitrate_kbps", ""), "bitrate_kbps", line)
            if loss > 100: raise ValueError(f"ligne {line}: packet_loss_pct doit être compris entre 0 et 100")
            if bitrate > 100_000 or not bitrate.is_integer():
                raise ValueError(f"ligne {line}: bitrate_kbps doit être un entier entre 0 et 100000")
            candidate = (row.get("candidate_type") or "").strip().lower()
            if candidate not in CANDIDATE_TYPES:
                raise ValueError(f"ligne {line}: candidate_type doit être host, srflx ou relay")
            samples.append(Sample(call_id, ts, rtt, jitter, loss, int(bitrate), candidate, _label(row.get("degraded", ""), line)))
    if not samples: raise ValueError("le fichier ne contient aucun échantillon")
    return samples

def confusion(labels: list[bool], predictions: list[bool]) -> dict[str, int | float]:
    tp = sum(actual and predicted for actual, predicted in zip(labels, predictions))
    fp = sum((not actual) and predicted for actual, predicted in zip(labels, predictions))
    fn = sum(actual and (not predicted) for actual, predicted in zip(labels, predictions))
    tn = sum((not actual) and (not predicted) for actual, predicted in zip(labels, predictions))
    precision = tp / (tp + fp) if tp + fp else 0.0
    recall = tp / (tp + fn) if tp + fn else 0.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    return {"tp": tp, "fp": fp, "fn": fn, "tn": tn, "precision": round(precision, 4), "recall": round(recall, 4), "f1": round(f1, 4)}

def _condition_summary(group: list[Sample]) -> dict[str, int | float]:
    if not group:
        return {}
    rtts = sorted(sample.rtt_ms for sample in group)
    p95_index = max(0, math.ceil(0.95 * len(rtts)) - 1)
    return {
        "samples": len(group),
        "median_rtt_ms": round(statistics.median(rtts), 2),
        "p95_rtt_ms": round(rtts[p95_index], 2),
        "mean_jitter_ms": round(statistics.mean(sample.jitter_ms for sample in group), 2),
        "mean_packet_loss_pct": round(statistics.mean(sample.packet_loss_pct for sample in group), 2),
        "relay_share": round(sum(sample.candidate_type == "relay" for sample in group) / len(group), 4),
    }

def evaluate(samples: Iterable[Sample], *, alpha: float = 0.3, rtt_threshold_ms: float = 150.0,
             jitter_threshold_ms: float = 30.0, packet_loss_threshold_pct: float = 3.0) -> dict[str, object]:
    if not 0 < alpha <= 1: raise ValueError("alpha doit être dans ]0, 1]")
    if min(rtt_threshold_ms, jitter_threshold_ms, packet_loss_threshold_pct) <= 0:
        raise ValueError("les seuils doivent être strictement positifs")
    ordered = sorted(samples, key=lambda sample: (sample.call_id, sample.ts))
    labels = [sample.degraded for sample in ordered]
    fixed_predictions, ewma_predictions = [], []
    state: dict[str, tuple[float, float, float]] = {}
    for sample in ordered:
        raw = (sample.rtt_ms, sample.jitter_ms, sample.packet_loss_pct)
        previous = state.get(sample.call_id)
        smoothed = raw if previous is None else tuple(alpha * current + (1 - alpha) * old for current, old in zip(raw, previous))
        state[sample.call_id] = smoothed
        fixed_predictions.append(sample.rtt_ms >= rtt_threshold_ms or sample.jitter_ms >= jitter_threshold_ms or sample.packet_loss_pct >= packet_loss_threshold_pct)
        ewma_predictions.append(smoothed[0] >= rtt_threshold_ms or smoothed[1] >= jitter_threshold_ms or smoothed[2] >= packet_loss_threshold_pct)
    by_candidate = {}
    for candidate in sorted(CANDIDATE_TYPES):
        group = [sample for sample in ordered if sample.candidate_type == candidate]
        if group:
            degraded_count = sum(sample.degraded for sample in group)
            by_candidate[candidate] = {"samples": len(group), "degraded_samples": degraded_count, "degraded_rate": round(degraded_count / len(group), 4)}
    return {
        "sample_count": len(ordered),
        "degraded_samples": sum(labels),
        "thresholds": {"rtt_ms": rtt_threshold_ms, "jitter_ms": jitter_threshold_ms, "packet_loss_pct": packet_loss_threshold_pct, "ewma_alpha": alpha},
        "models": {"fixed_threshold": confusion(labels, fixed_predictions), "ewma": confusion(labels, ewma_predictions)},
        "candidate_types": by_candidate,
        "conditions": {
            "normal": _condition_summary([sample for sample in ordered if not sample.degraded]),
            "degraded": _condition_summary([sample for sample in ordered if sample.degraded]),
        },
        "label_definition": "degraded décrit la condition réseau injectée, pas une note subjective de qualité.",
    }

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("csv_file", type=Path, help="CSV exporté de call_quality_samples, enrichi du label degraded")
    parser.add_argument("--output", type=Path, help="chemin JSON de sortie (stdout par défaut)")
    parser.add_argument("--alpha", type=float, default=0.3)
    parser.add_argument("--rtt-threshold-ms", type=float, default=150.0)
    parser.add_argument("--jitter-threshold-ms", type=float, default=30.0)
    parser.add_argument("--packet-loss-threshold-pct", type=float, default=3.0)
    args = parser.parse_args()
    try:
        result = evaluate(load_samples(args.csv_file), alpha=args.alpha, rtt_threshold_ms=args.rtt_threshold_ms,
                         jitter_threshold_ms=args.jitter_threshold_ms, packet_loss_threshold_pct=args.packet_loss_threshold_pct)
    except (OSError, ValueError) as exc:
        print(f"Erreur: {exc}", file=sys.stderr)
        return 2
    rendered = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
    if args.output: args.output.write_text(rendered, encoding="utf-8")
    else: sys.stdout.write(rendered)
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
