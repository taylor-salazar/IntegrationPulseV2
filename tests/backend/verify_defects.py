"""Run the intended assertions without expected-failure handling (red until fixed)."""
import unittest
from pathlib import Path

def cases(suite):
    for item in suite:
        if isinstance(item, unittest.TestSuite): yield from cases(item)
        else: yield item

if __name__ == '__main__':
    suite = unittest.defaultTestLoader.discover(str(Path(__file__).parent), pattern='test_*.py')
    selected = unittest.TestSuite()
    for case in cases(suite):
        if '_QA_' in case._testMethodName:
            getattr(type(case), case._testMethodName).__unittest_expecting_failure__ = False
            selected.addTest(case)
    result = unittest.TextTestRunner(verbosity=2).run(selected)
    raise SystemExit(not result.wasSuccessful())
