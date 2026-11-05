#!/usr/bin/env python3
"""Validate the versioned Salary Flow reference datasets without changing values."""
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
TYPES = ("tax", "us", "world", "payroll", "arizona")
FILING = {"single", "mfs", "mfj", "hoh"}
errors = []


def check(condition, message):
    if not condition:
        errors.append(message)


def increasing(values, n):
    return (isinstance(values, list) and len(values) == n
            and all(isinstance(v, (int, float)) and not isinstance(v, bool) and v > 0
                    and (i == 0 or v > values[i - 1]) for i, v in enumerate(values)))


manifest = json.loads((ROOT / "data/manifest.json").read_text(encoding="utf-8"))
check(manifest.get("schema") == 1, "manifest schema must be 1")
check(all(name in manifest for name in TYPES), "manifest missing a dataset")

for kind in TYPES:
    entry = manifest.get(kind, {})
    rel = entry.get("path", "")
    check(bool(re.fullmatch(r"data/[a-z0-9-]+\.json", rel)), f"{kind}: unsafe path")
    if not re.fullmatch(r"data/[a-z0-9-]+\.json", rel):
        continue
    file = ROOT / rel
    check(file.is_file(), f"{kind}: missing {rel}")
    if not file.is_file():
        continue
    data = json.loads(file.read_text(encoding="utf-8"))
    check(data.get("schema") == 1, f"{kind}: schema mismatch")
    year = entry.get("year")
    check(type(year) is int and 2024 <= year <= 2100, f"{kind}: invalid year")
    check(bool(re.match(r"https://", data.get("source", ""))), f"{kind}: missing HTTPS source")
    if kind in ("tax", "payroll", "arizona"):
        check(data.get("taxYear") == year, f"{kind}: taxYear differs from manifest")
    if kind == "tax":
        v = data.get("values", {})
        check(set(v) == FILING, "tax: missing filing status")
        for filing in FILING:
            item = v.get(filing, {})
            check(isinstance(item.get("ded"), (int, float)) and item["ded"] >= 0,
                  f"tax: {filing} deduction invalid")
            check(increasing(item.get("br"), 6), f"tax: {filing} brackets invalid")
    elif kind == "us":
        check(data.get("editionYear") == year and data.get("incomeYear") == entry.get("incomeYear") == year-1,
              "us: year mismatch")
        values = data.get("values", {})
        check(len(values) == 52 and "US" in values and "AZ" in values, "us: expected 50 states, DC, US")
        for state, values in values.items():
            check(increasing(values, 4), f"us: bad percentile values for {state}")
    elif kind == "world":
        check(data.get("incomeYear") == year, "world: year mismatch")
        for country, item in data.get("values", {}).items():
            check(bool(item.get("name") and item.get("ko") and item.get("currency")),
                  f"world: missing labels for {country}")
            check(increasing(item.get("points"), 6), f"world: bad percentile values for {country}")
    elif kind == "payroll":
        check(100000 < data.get("socialSecurityWageBase", 0) < 500000,
              "payroll: wage base outside reasonable bounds")
        for key, rate in (("socialSecurityRate", .062), ("medicareRate", .0145),
                          ("additionalMedicareRate", .009)):
            check(data.get(key) == rate, f"payroll: unexpected {key}")
        check(data.get("additionalMedicareThresholds") ==
              {"single": 200000, "mfj": 250000, "mfs": 125000, "hoh": 200000},
              "payroll: unexpected Additional Medicare thresholds")
    elif kind == "arizona":
        check(0 < data.get("rate", 0) < .1, "arizona: state tax rate invalid")
        for key, limit in (("standardDeduction", 100000), ("charityMax", 5000)):
            values = data.get(key, {})
            check(set(values) == FILING, f"arizona: {key} statuses missing")
            for filing, amount in values.items():
                check(type(amount) is int and 0 <= amount <= limit,
                      f"arizona: {key}.{filing} invalid")
    print(f"Checked {kind}: {rel}")

# Review-only candidates are versioned but must NEVER affect the active manifest.
active_payroll = json.loads((ROOT / manifest["payroll"]["path"]).read_text(encoding="utf-8"))
for candidate_path in (ROOT / "data/candidates").glob("payroll-*.json"):
    candidate = json.loads(candidate_path.read_text(encoding="utf-8"))
    year_from_name = int(candidate_path.stem.split("-")[-1])
    check(candidate.get("taxYear") == year_from_name, f"{candidate_path.name}: year mismatch")
    if year_from_name > active_payroll["taxYear"]:
        check(candidate.get("schema") == 1, f"{candidate_path.name}: bad schema")
        base = candidate.get("socialSecurityWageBase", 0)
        previous = active_payroll["socialSecurityWageBase"]
        check(type(base) is int and base % 300 == 0 and previous <= base <= previous * 1.2,
              f"{candidate_path.name}: implausible cap")
        check(candidate.get("source", "").startswith("https://www.ssa.gov/"),
              f"{candidate_path.name}: source is not SSA")
        for key in ("socialSecurityRate", "medicareRate", "additionalMedicareRate",
                    "additionalMedicareThresholds"):
            check(candidate.get(key) == active_payroll.get(key),
                  f"{candidate_path.name}: unexpected change to {key}")
    print(f"Checked candidate: {candidate_path.name}")

# Arizona candidates must remain inactive and match current statutory assumptions.
active_arizona = json.loads((ROOT / manifest["arizona"]["path"]).read_text(encoding="utf-8"))
for candidate_path in (ROOT / "data/candidates").glob("arizona-*.json"):
    candidate = json.loads(candidate_path.read_text(encoding="utf-8"))
    year_from_name = int(candidate_path.stem.split("-")[-1])
    check(candidate.get("taxYear") == year_from_name,
          f"{candidate_path.name}: taxYear differs from filename")
    if year_from_name > active_arizona["taxYear"]:
        check(candidate.get("schema") == 1, f"{candidate_path.name}: schema mismatch")
        check(candidate.get("source") ==
              "https://azdor.gov/forms/individual-income-tax-highlights",
              f"{candidate_path.name}: untrusted Arizona deduction source")
        check(candidate.get("rate") == active_arizona["rate"],
              f"{candidate_path.name}: state rate changed without rate-specific approval")
        check(candidate.get("charityMax") == active_arizona["charityMax"],
              f"{candidate_path.name}: charity caps changed without statutory review")
        deductions = candidate.get("standardDeduction", {})
        check(set(deductions) == FILING, f"{candidate_path.name}: missing filing status")
        for filing in FILING:
            amount = deductions.get(filing)
            previous = active_arizona["standardDeduction"][filing]
            check(type(amount) is int and previous <= amount <= previous * 1.2,
                  f"{candidate_path.name}: deduction {filing} out of bounds")
        check(deductions.get("single") == deductions.get("mfs"),
              f"{candidate_path.name}: single/MFS mismatch")
    print(f"Checked candidate: {candidate_path.name}")

# Inline fallback is mandatory: the site must start even when JSON fetches fail.
index = (ROOT / "index.html").read_text(encoding="utf-8")
check("const REFERENCE_BASELINE=" in index, "HTML baseline missing")
check("async function loadReferenceData()" in index, "reference fallback loader missing")
check("if(!value){value=REFERENCE_BASELINE[k]" in index, "default fallback missing")
check(index.index("const ARIZONA_RULES=REFERENCE_DATA.arizona;") <
      index.index("let config="), "Arizona constants must initialize before config")

if errors:
    for error in errors:
        print("ERROR:", error, file=sys.stderr)
    sys.exit(1)
print("All reference datasets and fallback checks passed.")
