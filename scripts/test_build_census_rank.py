#!/usr/bin/env python3
import importlib.util
import io
import json
import pathlib
import tempfile
import unittest
import zipfile
from contextlib import redirect_stdout

spec = importlib.util.spec_from_file_location('build_census_rank', pathlib.Path(__file__).with_name('build_census_rank.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def fixture_zip(rows):
    output = io.BytesIO()
    with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as archive:
        text = 'AGEP,PERNP,PWGTP,ADJINC\n' + ''.join(f'{age},{earning},{weight},{adj}\n' for age,earning,weight,adj in rows)
        archive.writestr('person_fixture.csv', text)
    return output.getvalue()


class TestCensusPums(unittest.TestCase):
    def test_weighted_quantile_uses_weights_not_row_count(self):
        values = module.weighted_percentiles([(100,1),(200,1),(300,98)])
        self.assertEqual(values[49], 300)
        self.assertEqual(values[0], 100)
        self.assertEqual(values[-1], 300)
        self.assertEqual(len(values), 99)

    def test_age_earnings_inflation_and_blank_filter(self):
        rows=[(14,900000,2,1000000),(34,0,2,1000000),(22,100,1,1000000),
              (45,150,2,1000000),(50,150,1,1100000),(65,300,0,1000000)]
        values=list(module.archive_rows(fixture_zip(rows),'AZ'))
        self.assertEqual(values,[(100,1),(150,2),(165,1)])

    def test_no_eligible_respondents_rejected(self):
        with self.assertRaises(ValueError):
            list(module.archive_rows(fixture_zip([(12,100,5,1000000)]),'AZ'))

    def test_end_to_end_offline_zip_fixture(self):
        with tempfile.TemporaryDirectory() as path:
            folder=pathlib.Path(path)
            rows=[(20+index%40,20000+index*1500,1+(index%7),1000000) for index in range(200)]
            (folder/'csv_paz.zip').write_bytes(fixture_zip(rows))
            import sys
            old=sys.argv[:]
            sys.argv=['build_census_rank.py','--input-dir',path,'--states','AZ','--output',str(folder/'out.json')]
            try:
                with redirect_stdout(io.StringIO()):
                    module.main()
            finally:
                sys.argv=old
            data=json.loads((folder/'out.json').read_text())
            self.assertEqual(data['schema'],2)
            self.assertEqual(data['metric'],'PERNP')
            self.assertEqual(data['weight'],'PWGTP')
            self.assertEqual(data['percentiles'],list(range(1,100)))
            self.assertEqual(data['sampleCounts']['AZ'],200)
            self.assertEqual(len(data['values']['AZ']),99)
            self.assertNotIn('US',data['values'])


if __name__=='__main__':
    unittest.main()
