import importlib.util, io, json, threading, unittest, urllib.request, urllib.error
from pathlib import Path
spec=importlib.util.spec_from_file_location('tinylab_server',Path(__file__).resolve().parent.parent/'scripts/serve.py')
server_module=importlib.util.module_from_spec(spec);spec.loader.exec_module(server_module)
class ServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server=server_module.ThreadingHTTPServer(('127.0.0.1',0),server_module.Handler)
        cls.port=cls.server.server_port;cls.base=f'http://127.0.0.1:{cls.port}'
        cls.thread=threading.Thread(target=cls.server.serve_forever,daemon=True);cls.thread.start()
    @classmethod
    def tearDownClass(cls): cls.server.shutdown();cls.server.server_close()
    def test_private_paths_are_not_served(self):
        for path in ['/.git/config','/node_modules/pdf-lib/package.json','/scripts/serve.py','/tests/core.test.mjs']:
            with self.assertRaises(urllib.error.HTTPError) as caught: urllib.request.urlopen(self.base+path)
            self.assertEqual(caught.exception.code,404)
    def test_cross_origin_converter_is_denied(self):
        req=urllib.request.Request(self.base+'/api/office',data=b'test',headers={'Origin':'https://example.invalid','Content-Type':'application/octet-stream','X-Filename':'test.docx'})
        with self.assertRaises(urllib.error.HTTPError) as caught: urllib.request.urlopen(req)
        self.assertEqual(caught.exception.code,403)
    def test_wrong_type_is_denied(self):
        req=urllib.request.Request(self.base+'/api/office',data=b'test',headers={'Content-Type':'text/plain','X-Filename':'test.docx'})
        with self.assertRaises(urllib.error.HTTPError) as caught: urllib.request.urlopen(req)
        self.assertEqual(caught.exception.code,415)
    def test_loopback_capabilities(self):
        data=json.load(urllib.request.urlopen(self.base+'/api/capabilities'));self.assertTrue(data['local'])
    def test_seo_tool_landing_page_and_sitemap(self):
        page=urllib.request.urlopen(self.base+'/merge-pdf/').read().decode('utf-8')
        self.assertIn('data-tool-page="merge-pdf"',page)
        sitemap=urllib.request.urlopen(self.base+'/sitemap.xml').read().decode('utf-8')
        self.assertIn('https://4u.ia.br/app/tinylab/merge-pdf/',sitemap)
if __name__=='__main__':unittest.main()
