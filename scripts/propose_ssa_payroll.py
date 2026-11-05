#!/usr/bin/env python3
"""Produce an unactivated next-year payroll candidate from two official SSA pages."""
import argparse
import html
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
SSA_BASE = "https://www.ssa.gov/oact/cola/cbb.html"
SSA_FACT = "https://www.ssa.gov/news/en/cola/factsheets/{year}.html"


class PlainText(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []

    def handle_data(self, data):
        self.parts.append(data)

    def result(self):
        return " ".join(html.unescape(" ".join(self.parts)).split())


def extract_official_base(page):
    parser = PlainText()
    parser.feed(page)
    text = parser.result()
    matches = re.findall(
        r"For earnings in (20\d{2}), this base is \$([\d,]+)", text,
        flags=re.IGNORECASE)
    if len(matches) != 1:
        raise ValueError("Expected exactly one SSA contribution base statement")
    year, amount = matches[0]
    return int(year), int(amount.replace(",", ""))


def fetch(url):
    request = urllib.request.Request(url, headers={"User-Agent": "SalaryFlowReferenceMonitor/1.0"})
    with urllib.request.urlopen(request, timeout=25) as response:
        if response.status != 200:
            raise RuntimeError(f"SSA source returned HTTP {response.status}")
        return response.read().decode("utf-8")


def candidate_from_pages(cbb_page, factsheet_page, current):
    year, wage_base = extract_official_base(cbb_page)
    if year <= current["taxYear"]:
        return None
    if year != current["taxYear"] + 1:
        raise ValueError("Unexpected gap in payroll tax years")
    if not (current["socialSecurityWageBase"] <= wage_base <= current["socialSecurityWageBase"] * 1.2):
        raise ValueError("Unexpected SSA wage-base change")
    if wage_base % 300:
        raise ValueError("Social Security wage base must be a multiple of $300")
    parser = PlainText()
    parser.feed(factsheet_page)
    fact_text = parser.result()
    # Require independent corroboration: the named taxable-earnings section,
    # the exact target year, and the announced value must be present.
    section = re.search(r"Maximum Taxable Earnings(.{0,450})", fact_text, flags=re.I)
    if not section or f"{wage_base:,}" not in section.group(1) or str(year) not in fact_text:
        raise ValueError("SSA factsheet did not corroborate the new taxable maximum")
    return {
        **current,
        "taxYear": year,
        "source": SSA_BASE,
        "retrieval": (f"Automated candidate verified against SSA taxable-maximum page "
                      f"and {SSA_FACT.format(year=year)}; not active until separately approved."),
        "socialSecurityWageBase": wage_base,
    }


def main():
    args = argparse.ArgumentParser()
    args.add_argument("--output", default="data/candidates")
    options = args.parse_args()
    manifest = json.loads((ROOT / "data/manifest.json").read_text(encoding="utf-8"))
    current = json.loads((ROOT / manifest["payroll"]["path"]).read_text(encoding="utf-8"))
    cbb = fetch(SSA_BASE)
    year, _ = extract_official_base(cbb)
    if year <= current["taxYear"]:
        print("No newer SSA payroll year announced.")
        return
    factsheet = fetch(SSA_FACT.format(year=year))
    candidate = candidate_from_pages(cbb, factsheet, current)
    output = ROOT / options.output / f"payroll-{year}.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(candidate, indent=2) + "\n", encoding="utf-8")
    print(f"Candidate created at {output.relative_to(ROOT)}; manifest unchanged.")


if __name__ == "__main__":
    main()
