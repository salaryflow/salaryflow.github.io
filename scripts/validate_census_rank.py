#!/usr/bin/env python3
"""Validate the published Census PUMS rank table. Never silently accept partial samples."""
import json
from pathlib import Path
from build_census_rank import STATES, YEAR, PERCENTILES

ROOT = Path(__file__).resolve().parents[1]
path = ROOT / f'data/income-census-{YEAR}.json'
if not path.is_file():
    raise SystemExit('Census PUMS ranking file not yet generated. Run scripts/build_census_rank.py with official ZIPs.')
data = json.loads(path.read_text(encoding='utf-8'))
assert data['schema'] == 2
assert data['incomeYear'] == YEAR and data['editionYear'] == YEAR
assert data['source'] == 'https://www.census.gov/programs-surveys/acs/microdata/access/2024.html'
assert data['sourceFiles'] == 'https://www2.census.gov/programs-surveys/acs/data/pums/2024/1-Year/csv_p{state}.zip'
assert data['metric'] == 'PERNP' and data['weight'] == 'PWGTP' and data['inflationAdjuster'] == 'ADJINC'
assert data['percentiles'] == PERCENTILES
assert set(data['values']) == set(STATES) | {'US'}
assert set(data['sampleCounts']) == set(STATES) | {'US'}
assert sum(data['sampleCounts'][state] for state in STATES) == data['sampleCounts']['US']
assert data['sampleCounts']['US'] >= 100000, 'Partial national sample'
for state, points in data['values'].items():
    assert len(points) == len(PERCENTILES), (state, 'wrong percentile count')
    assert data['sampleCounts'][state] >= 100, (state, 'insufficient survey respondents')
    assert all(isinstance(v,int) and 0 < v < 100000000 and (i == 0 or v >= points[i-1])
               for i,v in enumerate(points)), (state, 'invalid or unsorted thresholds')
assert 20000 < data['values']['US'][49] < 150000, 'Unexpected national individual-earnings median'
print('PASS: 2024 Census ACS PUMS rank table: 50 states, DC, US, P1-P99, source and 2024 weighted samples')
