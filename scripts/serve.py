#!/usr/bin/env python3
"""Loopback-only preview with an optional, ephemeral LibreOffice converter."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlparse, unquote
import argparse, json, mimetypes, shutil, subprocess, tempfile, threading
ROOT = Path(__file__).resolve().parent.parent
OFFICE = shutil.which('libreoffice')
LIMIT = 100 * 1024 * 1024
LOCK = threading.Semaphore(1)
class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw): super().__init__(*a, directory=str(ROOT), **kw)
    def end_headers(self):
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'same-origin')
        self.send_header('Cache-Control', 'no-cache' if not self.path.startswith('/vendor/') else 'public, max-age=3600')
        super().end_headers()
    def error(self, status, text):
        body = json.dumps({'error': text}).encode()
        self.send_response(status); self.send_header('Content-Type', 'application/json'); self.send_header('Content-Length', str(len(body))); self.end_headers(); self.wfile.write(body)
    def do_GET(self):
        parts=Path(unquote(urlparse(self.path).path)).parts
        if any(p.startswith('.') or p in ('node_modules','scripts','tests') for p in parts): return self.send_error(404)
        if self.path == '/api/capabilities':
            data=json.dumps({'office':bool(OFFICE),'local':True}).encode(); self.send_response(200); self.send_header('Content-Type','application/json'); self.send_header('Content-Length',str(len(data))); self.end_headers(); self.wfile.write(data); return
        super().do_GET()
    def do_POST(self):
        if self.path != '/api/office': return self.error(404, 'Endpoint inexistente / Endpoint not found.')
        host=self.headers.get('Host','')
        if host not in (f'127.0.0.1:{self.server.server_port}',f'localhost:{self.server.server_port}'):
            return self.error(403,'Host inválido / Invalid host.')
        origin=self.headers.get('Origin')
        if origin and origin != f'http://{host}': return self.error(403,'Origem inválida / Invalid origin.')
        if self.headers.get('Content-Type') != 'application/octet-stream': return self.error(415,'Use application/octet-stream.')
        if not OFFICE: return self.error(503,'LibreOffice não está instalado neste computador / LibreOffice is not installed on this computer.')
        try: size=int(self.headers.get('Content-Length','0'))
        except ValueError: return self.error(400,'Tamanho inválido / Invalid size.')
        if not 0 < size <= LIMIT: return self.error(413,'Limite: 100 MB / Limit: 100 MB.')
        ext=Path(unquote(self.headers.get('X-Filename',''))).suffix.lower()
        if ext not in ('.docx','.doc','.odt','.xlsx','.xls','.ods','.ppt','.pptx','.odp'): return self.error(415,'Formato de documento inválido / Invalid document format.')
        if not LOCK.acquire(blocking=False): return self.error(429,'Conversor ocupado. Tente novamente em instantes / Converter busy. Try again shortly.')
        try:
            with tempfile.TemporaryDirectory(prefix='tinylab-') as tmp:
                folder=Path(tmp); src=folder/('document'+ext)
                remaining=size
                with src.open('wb') as f:
                    while remaining:
                        chunk=self.rfile.read(min(65536,remaining))
                        if not chunk: return self.error(400,'Arquivo incompleto / Incomplete file.')
                        f.write(chunk); remaining-=len(chunk)
                subprocess.run([OFFICE,'-env:UserInstallation='+ (folder/'profile').as_uri(),'--headless','--convert-to','pdf','--outdir',str(folder),str(src)],capture_output=True,timeout=120,check=True)
                result=folder/'document.pdf'
                if not result.exists(): return self.error(422,'Não foi possível converter este documento / Unable to convert this document.')
                body=result.read_bytes(); self.send_response(200); self.send_header('Content-Type','application/pdf'); self.send_header('Content-Length',str(len(body))); self.send_header('Cache-Control','no-store'); self.end_headers(); self.wfile.write(body)
        except subprocess.TimeoutExpired: self.error(504,'Conversão excedeu 120 segundos / Conversion exceeded 120 seconds.')
        except (OSError,subprocess.CalledProcessError): self.error(422,'Falha na conversão local / Local conversion failed.')
        finally: LOCK.release()
if __name__ == '__main__':
    parser=argparse.ArgumentParser(); parser.add_argument('--port',type=int,default=4173); args=parser.parse_args()
    mimetypes.add_type('application/wasm','.wasm'); mimetypes.add_type('text/javascript','.mjs')
    server=ThreadingHTTPServer(('127.0.0.1',args.port),Handler)
    print(f'TinyLab: http://127.0.0.1:{args.port} (LibreOffice: {bool(OFFICE)})',flush=True)
    try: server.serve_forever()
    except KeyboardInterrupt: pass
    finally: server.server_close()
