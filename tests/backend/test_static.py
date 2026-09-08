"""Static checks complement, and do not substitute for, UI5 browser testing."""
import json
import unittest
import xml.etree.ElementTree as ET
from support import ROOT

class StaticContracts(unittest.TestCase):
    def test_manifest_routes_resolve_to_existing_well_formed_xml_views(self):
        manifest = json.loads((ROOT / 'webapp/manifest.json').read_text())
        routing = manifest['sap.ui5']['routing']
        for route in routing['routes']:
            target = routing['targets'][route['target']]
            ET.parse(ROOT / ('webapp/view/' + target['viewName'] + '.view.xml'))
        for xml_file in (ROOT / 'webapp/view').glob('*.xml'):
            with self.subTest(file=xml_file.name): ET.parse(xml_file)

    def test_repository_mock_files_are_valid_json(self):
        for fixture in (ROOT / 'webapp/localService/mockdata').glob('*.json'):
            with self.subTest(file=fixture.name): self.assertIsInstance(json.loads(fixture.read_text(encoding='utf8')), dict)
