#!/usr/bin/env python3
"""Generate a versioned US + state income percentile table from official ACS 1-year PUMS person files.

Population: age >= 16, positive PERNP (annual employment + self-employment earnings).
PERNP dollars are multiplied by ADJINC/1,000,000; rank is weighted by PWGTP.
Never substitute, extrapolate, or fabricate missing states.
Source: https://www.census.gov/programs-surveys/acs/microdata/access/2024.html

Usage:
 python3 scripts/build_census_rank.py --download --output data/income-census-2024.json
 python3 scripts/build_census_rank.py --input-dir /path/to/official-zips --output /tmp/census.json
 python3 scripts/build_census_rank.py --input-dir /tmp/test --states AZ,CA --output /tmp/sample.json
"""
import argparse
import csv
import io
import json
import math
from pathlib import Path
import urllib.request
import zipfile

YEAR = 2024
SOURCE = 'https://www2.census.gov/programs-surveys/acs/data/pums/2024/1-Year/'
STATES = ('AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN '
          'MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY').split()
PERCENTILES = list(range(1, 100))


def weighted_percentiles(rows):
    """Direct weighted empirical CDF quantiles, not an interpolation between four guessed breakpoints."""
    if not rows:
        raise ValueError('No eligible positive-earnings respondents')
    rows.sort(key=lambda r: r[0])
    total = sum(w for _, w in rows)
    if total <= 0:
        raise ValueError('Nonpositive total weight')
    out = []
    cumulative = 0
    i = 0
    for pct in PERCENTILES:
        target = total * pct / 100
        while i < len(rows) and cumulative < target:
            cumulative += rows[i][1]
            i += 1
        out.append(round(rows[min(i - 1, len(rows) - 1)][0]))
    return out


def archive_rows(binary, state):
    with zipfile.ZipFile(io.BytesIO(binary)) as archive:
        files = [f for f in archive.namelist() if f.lower().endswith('.csv') and not f.startswith('__MACOSX')]
        if len(files) != 1:
            raise ValueError(f'{state}: expected 1 person CSV, got {files}')
        with archive.open(files[0]) as handle:
            reader = csv.DictReader(io.TextIOWrapper(handle, encoding='utf-8-sig', newline=''))
            columns = set(reader.fieldnames or [])
            needed = {'PERNP', 'PWGTP', 'AGEP', 'ADJINC'}
            if not needed.issubset(columns):
                raise ValueError(f'{state}: missing {sorted(needed - columns)}')
            seen = 0
            for row in reader:
                age = int(row['AGEP'] or 0)
                amount = float(row['PERNP'] or 0)
                weight = int(row['PWGTP'] or 0)
                adj = float(row['ADJINC'] or 0)
                if age < 16 or amount <= 0 or weight <= 0 or adj <= 0:
                    continue
                earning = round(amount * adj / 1_000_000)
                if earning <= 0 or not math.isfinite(earning):
                    continue
                seen += 1
                yield earning, weight
            if not seen:
                raise ValueError(f'{state}: no eligible earnings records')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--download', action='store_true', help='Download zip files from official Census FTP over HTTPS')
    parser.add_argument('--input-dir', type=Path, help='Offline directory of original csv_pXX.zip files')
    parser.add_argument('--states', default=','.join(STATES), help='Comma-separated list; full production requires all 51')
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    if args.download == bool(args.input_dir):
        parser.error('Specify exactly one of --download or --input-dir')
    states = args.states.upper().split(',')
    if len(states) != len(set(states)) or any(s not in STATES for s in states):
        parser.error('Duplicate or unknown states')
    result = {'schema': 2, 'incomeYear': YEAR, 'editionYear': YEAR,
              'source': 'https://www.census.gov/programs-surveys/acs/microdata/access/2024.html',
              'sourceFiles': SOURCE + 'csv_p{state}.zip',
              'metric': 'PERNP', 'weight': 'PWGTP', 'inflationAdjuster': 'ADJINC',
              'population': 'Age 16+ people with positive annual personal earnings; excludes non-earners',
              'percentiles': PERCENTILES, 'values': {}, 'sampleCounts': {}}
    all_rows = []
    for state in states:
        name = f'csv_p{state.lower()}.zip'
        if args.download:
            url = SOURCE + name
            print('Downloading', url, flush=True)
            request = urllib.request.Request(url, headers={'User-Agent': 'SalaryFlowPUMSDataBuild/1.0'})
            with urllib.request.urlopen(request, timeout=120) as response:
                raw = response.read()
        else:
            raw = (args.input_dir / name).read_bytes()
        records = list(archive_rows(raw, state))
        if len(records) < 10:
            raise ValueError(f'{state}: insufficient records ({len(records)})')
        result['sampleCounts'][state] = len(records)
        all_rows.extend(records)
        result['values'][state] = weighted_percentiles(records)
        print(state, len(records), 'median', result['values'][state][49], flush=True)
    if set(states) == set(STATES):
        result['sampleCounts']['US'] = len(all_rows)
        result['values']['US'] = weighted_percentiles(all_rows)
        if len(all_rows) < 100_000:
            raise ValueError('US sample unexpectedly small')
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, separators=(',', ':')) + '\n', encoding='utf-8')
    print('Generated', args.output, 'from', len(states), 'Census state person files', flush=True)


if __name__ == '__main__':
    main()
