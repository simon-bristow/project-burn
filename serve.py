"""Static dev server that tells the browser never to cache, so a normal reload
always picks up the latest code. Usage: python3 serve.py [port]"""

import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    root = Path(__file__).resolve().parent
    handler = partial(NoCacheHandler, directory=str(root))
    with ThreadingHTTPServer(("", port), handler) as server:
        print(f"Serving {root} at http://localhost:{port} (no-cache). Ctrl+C to stop.")
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
