#!/usr/bin/env python3
import http.server, json, os, subprocess, threading

PORT         = 9000
DEPLOY_TOKEN = os.environ.get("DEPLOY_TOKEN", "")
_lock        = threading.Lock()

def deploy():
    subprocess.run("cd /home/ubuntu/source/gallabox-churn && sudo git pull origin main && sudo docker compose up --build -d", shell=True)

class Handler(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path != "/deploy":
            return self._send(404, "not found")
        if DEPLOY_TOKEN and self.headers.get("X-Deploy-Token") != DEPLOY_TOKEN:
            return self._send(401, "unauthorized")
        if not _lock.acquire(blocking=False):
            return self._send(409, "already deploying")
        self._send(202, "deploy started")
        def _run():
            try: deploy()
            finally: _lock.release()
        threading.Thread(target=_run, daemon=True).start()

    def _send(self, code, msg):
        body = json.dumps({"status": msg}).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_): pass

http.server.HTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
