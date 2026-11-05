#!/usr/bin/env python3
"""Offline regression tests for the official SSA candidate extractor."""
import importlib.util
import pathlib
import unittest

PATH = pathlib.Path(__file__).with_name("propose_ssa_payroll.py")
spec = importlib.util.spec_from_file_location("ssa_monitor", PATH)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
BASE = {"schema": 1, "taxYear": 2026, "socialSecurityWageBase": 184500,
        "socialSecurityRate": .062, "medicareRate": .0145,
        "additionalMedicareRate": .009,
        "additionalMedicareThresholds": {"single": 200000, "mfj": 250000,
                                         "mfs": 125000, "hoh": 200000}}


class SSAMonitorTests(unittest.TestCase):
    def test_next_year(self):
        a = "<p>For earnings in 2027, this base is $192,300.</p>"
        b = "<table>2026 2027 Maximum Taxable Earnings Social Security (OASDI only) $184,500 $192,300</table>"
        v = m.candidate_from_pages(a, b, BASE)
        self.assertEqual(v["socialSecurityWageBase"], 192300)
        self.assertEqual(v["taxYear"], 2027)
        self.assertEqual(v["socialSecurityRate"], .062)

    def test_same_year_no_proposal(self):
        self.assertIsNone(m.candidate_from_pages(
            "<p>For earnings in 2026, this base is $184,500.</p>", "", BASE))

    def test_missing_corroboration_rejected(self):
        with self.assertRaises(ValueError):
            m.candidate_from_pages(
                "<p>For earnings in 2027, this base is $192,300.</p>",
                "2027 Maximum Taxable Earnings no amounts", BASE)

    def test_abnormal_change_rejected(self):
        with self.assertRaises(ValueError):
            m.candidate_from_pages(
                "<p>For earnings in 2027, this base is $400,200.</p>",
                "2027 Maximum Taxable Earnings Social Security $400,200", BASE)


if __name__ == "__main__":
    unittest.main()
