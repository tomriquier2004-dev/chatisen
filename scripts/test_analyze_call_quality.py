import csv
import tempfile
import unittest
from pathlib import Path
from analyze_call_quality import evaluate, load_samples

class QualityAnalysisTests(unittest.TestCase):
    def write_csv(self, rows):
        temp = tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", newline="", suffix=".csv", delete=False)
        self.addCleanup(Path(temp.name).unlink, missing_ok=True)
        writer = csv.DictWriter(temp, fieldnames=["call_id", "scenario", "ts", "rtt_ms", "jitter_ms", "packet_loss_pct", "bitrate_kbps", "candidate_type", "degraded"])
        writer.writeheader()
        writer.writerows(rows)
        temp.close()
        return Path(temp.name)

    def test_compares_fixed_threshold_and_ewma(self):
        path = self.write_csv([
            {"call_id":"a","scenario":"baseline","ts":"2026-11-25T10:00:00Z","rtt_ms":50,"jitter_ms":2,"packet_loss_pct":0,"bitrate_kbps":900,"candidate_type":"host","degraded":0},
            {"call_id":"a","scenario":"latency","ts":"2026-11-25T10:00:05Z","rtt_ms":200,"jitter_ms":2,"packet_loss_pct":0,"bitrate_kbps":800,"candidate_type":"relay","degraded":1},
            {"call_id":"a","scenario":"latency","ts":"2026-11-25T10:00:10Z","rtt_ms":250,"jitter_ms":2,"packet_loss_pct":0,"bitrate_kbps":700,"candidate_type":"relay","degraded":1},
        ])
        result = evaluate(load_samples(path), alpha=0.5)
        self.assertEqual(result["models"]["fixed_threshold"]["recall"], 1.0)
        self.assertEqual(result["models"]["ewma"]["recall"], 0.5)
        self.assertEqual(result["candidate_types"]["relay"]["samples"], 2)
        self.assertEqual(result["scenarios"]["baseline"]["median_rtt_ms"], 50)
        self.assertEqual(result["scenarios"]["latency"]["median_rtt_ms"], 225)
        self.assertEqual(result["scenarios"]["latency"]["relay_share"], 1.0)

    def test_ewma_state_is_isolated_per_call(self):
        path = self.write_csv([
            {"call_id":"a","ts":"2026-11-25T10:00:00Z","rtt_ms":250,"jitter_ms":2,"packet_loss_pct":0,"bitrate_kbps":700,"candidate_type":"relay","degraded":1},
            {"call_id":"b","scenario":"baseline","ts":"2026-11-25T10:00:01Z","rtt_ms":20,"jitter_ms":2,"packet_loss_pct":0,"bitrate_kbps":900,"candidate_type":"host","degraded":0},
        ])
        result = evaluate(load_samples(path), alpha=0.5)
        self.assertEqual(result["models"]["ewma"]["tn"], 1)
        self.assertEqual(result["models"]["ewma"]["tp"], 1)

    def test_rejects_invalid_packet_loss(self):
        path = self.write_csv([
            {"call_id":"a","ts":"2026-11-25T10:00:00Z","rtt_ms":50,"jitter_ms":2,"packet_loss_pct":101,"bitrate_kbps":900,"candidate_type":"host","degraded":0},
        ])
        with self.assertRaisesRegex(ValueError, "packet_loss_pct"):
            load_samples(path)

if __name__ == "__main__":
    unittest.main()
