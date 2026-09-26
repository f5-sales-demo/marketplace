import importlib.util,pathlib,tempfile,unittest
from unittest.mock import patch
p=pathlib.Path(__file__).parents[1]/'ghostty-setup.py';s=importlib.util.spec_from_file_location('g',p);g=importlib.util.module_from_spec(s);s.loader.exec_module(g)
class T(unittest.TestCase):
 def test_recursive_includes_and_cycles(self):
  with tempfile.TemporaryDirectory() as d:
   d=pathlib.Path(d);(d/'a').write_text('font-size = 12\nconfig-file = b\n');(d/'b').write_text('config-file = a\npalette = 1=#f00\n');ks,fs=g.graph(d/'a');self.assertTrue({'font-size','palette:1'}<=ks);self.assertEqual(len(fs),2)
 def test_merge_preserves_explicit_xorg_and_converges(self):
  with tempfile.TemporaryDirectory() as d:
   c=pathlib.Path(d)/'config';c.write_text('font-size = 12\n# XORGCTL user configuration\n')
   with patch.object(g,'valid',return_value=True):first,changed=g.merge(c);second,again=g.merge(c)
   self.assertTrue(changed);self.assertFalse(again);self.assertNotIn('font-size',first);self.assertIn('XORGCTL',c.read_text());self.assertEqual(second,{})
 def test_invalid_config_rolls_back(self):
  with tempfile.TemporaryDirectory() as d:
   c=pathlib.Path(d)/'config';c.write_text('bad = [\n')
   with patch.object(g,'valid',return_value=False):
    with self.assertRaisesRegex(RuntimeError,'existing_config_invalid'):g.merge(c)
   self.assertEqual(c.read_text(),'bad = [\n')
