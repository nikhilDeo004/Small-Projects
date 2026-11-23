"""
YouTube to MP3 - simple local web app (black & white).

HOW TO RUN:
1. Make sure yt-dlp is installed:   pip install -U yt-dlp
2. Check FFMPEG_PATH below.
3. Run:   python yt_mp3_app.py
4. Your browser opens at http://127.0.0.1:8765
MP3 files are saved to your Downloads folder by default.
"""

import html
import json
import os
import re
import socket
import subprocess
import sys
import threading
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import quote, urlparse, parse_qs

# ---------- EDIT THESE ----------
FFMPEG_PATH = r"C:\Users\Nikhil Deo\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.1.2-full_build\bin\ffmpeg.exe"
DEFAULT_OUTPUT = str(Path.home() / "Downloads")
PORT = 8765
ALLOW_PHONE = True   # True = also reachable from your phone on the same Wi-Fi
# --------------------------------

JOBS = []
LOCK = threading.Lock()
NEXT_ID = [0]
STATE = {"running": False, "folder": DEFAULT_OUTPUT}


def run_job(job, folder, quality):
    cmd = [
        sys.executable, "-m", "yt_dlp",
        "-x", "--audio-format", "mp3", "--audio-quality", quality,
        "--ffmpeg-location", str(Path(FFMPEG_PATH).parent),
        "--newline", "--no-playlist",
        "-o", str(Path(folder) / "%(title)s.%(ext)s"),
        job["url"],
    ]
    job["status"] = "Downloading"
    last = ""
    try:
        p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                             text=True, encoding="utf-8", errors="replace")
        for line in p.stdout:
            line = line.strip()
            if not line:
                continue
            last = line
            m = re.search(r"\[download\]\s+([\d.]+)%", line)
            if m:
                job["percent"] = min(float(m.group(1)), 99)
            m = re.search(r"Destination:\s+(.+)$", line)
            if m and job["title"].startswith("http"):
                job["title"] = Path(m.group(1)).stem
                job["file"] = str(Path(folder) / (job["title"] + ".mp3"))
            if "[ExtractAudio]" in line:
                job["status"], job["percent"] = "Converting", 99
                m = re.search(r"Destination:\s+(.+\.mp3)\s*$", line)
                if m:
                    job["file"] = m.group(1)
        p.wait()
        if p.returncode == 0:
            job["status"], job["percent"] = "Done", 100
        else:
            job["status"], job["error"] = "Failed", last[-200:]
    except Exception as e:
        job["status"], job["error"] = "Failed", str(e)


def worker(folder, quality):
    for job in JOBS:
        if job["status"] == "Waiting":
            run_job(job, folder, quality)
    STATE["running"] = False


PAGE = r"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#000000">
<title>YouTube to MP3</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,600;12..96,800&display=swap" rel="stylesheet">
<style>
:root{--bg:#000;--fg:#fff;--dim:#7d7d7d;--line:#262626}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html{background:var(--bg)}
body{margin:0;color:var(--fg);font-family:"Bricolage Grotesque","Helvetica Neue",Arial,sans-serif;line-height:1.5;-webkit-font-smoothing:antialiased}
main{max-width:860px;margin:0 auto;padding:max(9vh,env(safe-area-inset-top)) 28px calc(96px + env(safe-area-inset-bottom))}
header{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:9vh}
.logo{font-weight:800;font-size:18px;letter-spacing:-.02em}
.hint{color:var(--dim);font-size:14px}
h1{font-weight:800;font-size:clamp(48px,11vw,112px);line-height:.92;letter-spacing:-.05em;margin:0 0 40px}
.field{border-top:1px solid var(--fg);border-bottom:1px solid var(--fg)}
textarea{display:block;width:100%;min-height:150px;background:transparent;color:var(--fg);border:0;padding:22px 0;font:inherit;font-size:clamp(18px,3vw,24px);resize:vertical;outline:0}
textarea::placeholder{color:#4a4a4a}
.field:focus-within{border-color:var(--fg);box-shadow:0 1px 0 var(--fg)}
.controls{display:flex;flex-wrap:wrap;gap:28px 40px;align-items:flex-end;margin-top:28px}
.group{display:flex;flex-direction:column;gap:10px}
.group>span{font-size:13px;color:var(--dim)}
.seg{display:inline-flex;border:1px solid var(--fg)}
.seg input{position:absolute;opacity:0;pointer-events:none}
.seg label{padding:10px 18px;font-size:15px;cursor:pointer;user-select:none;border-right:1px solid var(--fg)}
.seg label:last-of-type{border-right:0}
.seg input:checked+label{background:var(--fg);color:var(--bg);font-weight:600}
.seg input:focus-visible+label{outline:2px solid var(--fg);outline-offset:3px}
.folder{flex:1;min-width:220px}
.folder input{width:100%;min-height:44px;background:transparent;color:var(--fg);border:0;border-bottom:1px solid var(--line);padding:9px 0;font:inherit;font-size:15px;border-radius:0}
.folder input:focus{outline:0;border-color:var(--fg)}
.go{margin-top:36px;width:100%;display:flex;justify-content:space-between;align-items:center;background:var(--fg);color:var(--bg);border:1px solid var(--fg);padding:22px 26px;font:inherit;font-size:22px;font-weight:800;letter-spacing:-.02em;cursor:pointer;border-radius:0;transition:background .15s,color .15s}
.go:hover:not(:disabled){background:var(--bg);color:var(--fg)}
.go:focus-visible{outline:2px solid var(--fg);outline-offset:4px}
.go:disabled{cursor:progress;opacity:.55}
.qhead{display:flex;justify-content:space-between;align-items:baseline;margin:80px 0 14px}
.qhead h2{margin:0;font-size:22px;font-weight:600;letter-spacing:-.02em}
.qhead button{background:none;border:0;color:var(--dim);font:inherit;font-size:14px;cursor:pointer;padding:4px 0;text-decoration:underline;text-underline-offset:3px}
.qhead button:hover{color:var(--fg)}
ul{list-style:none;padding:0;margin:0}
li{position:relative;border:1px solid var(--line);margin-bottom:8px;overflow:hidden;isolation:isolate}
li .fill{position:absolute;inset:0 auto 0 0;width:0;background:var(--fg);transition:width .35s ease;z-index:0}
li .row{position:relative;z-index:1;display:flex;justify-content:space-between;gap:20px;padding:18px 20px;color:#fff;mix-blend-mode:difference}
.name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:17px;font-weight:600}
.meta{flex:none;font-size:15px;font-variant-numeric:tabular-nums}
.err{padding:0 20px 14px;color:var(--dim);font-size:13px;word-break:break-word;position:relative;z-index:1}
.empty{color:var(--dim);border:1px dashed var(--line);padding:36px 20px;text-align:center}
a.save{color:inherit;font-weight:800;text-decoration:underline;text-underline-offset:3px}
@media(max-width:640px){
  main{padding-left:18px;padding-right:18px;padding-top:max(28px,env(safe-area-inset-top))}
  header{margin-bottom:36px}
  h1{margin-bottom:26px}
  textarea{min-height:120px;padding:16px 0;font-size:18px}
  .controls{flex-direction:column;align-items:stretch;gap:22px}
  .seg{display:flex;width:100%}
  .seg label{flex:1;text-align:center;padding:14px 4px}
  .folder{min-width:0}
  .folder input{font-size:16px}
  .go{position:sticky;bottom:calc(10px + env(safe-area-inset-bottom));margin-top:28px;padding:20px 20px;font-size:20px;min-height:60px}
  .qhead{margin-top:48px;flex-wrap:wrap;gap:6px}
  .qhead button{min-height:44px}
  li .row{padding:16px 14px;gap:12px}
  .name{font-size:16px}
  a.save{padding:6px 0}
}
@media(prefers-reduced-motion:reduce){li .fill,.go{transition:none}}
</style></head><body><main>
<header><span class="logo">YT→MP3</span><span class="hint">Runs on your computer</span></header>

<h1>Link in.<br>Music out.</h1>

<div class="field"><textarea id="urls" placeholder="Paste YouTube links here, one per line" aria-label="YouTube links"></textarea></div>

<div class="controls">
  <div class="group"><span>Quality</span>
    <div class="seg" role="radiogroup" aria-label="Quality">
      <input type="radio" name="q" id="q0" value="0"><label for="q0">Best</label>
      <input type="radio" name="q" id="q2" value="2" checked><label for="q2">High</label>
      <input type="radio" name="q" id="q5" value="5"><label for="q5">Standard</label>
    </div></div>
  <div class="group folder"><span>Save to</span><input id="folder" value="__FOLDER__" aria-label="Save folder"></div>
</div>

<button class="go" id="go"><span id="golabel">Convert to MP3</span><span>↓</span></button>

<div class="qhead"><h2>Queue</h2><div><button id="open">Open folder</button> &nbsp; <button id="clear">Clear finished</button></div></div>
<div class="empty" id="empty">Converted songs will show up here.</div>
<ul id="list"></ul>

<script>
const $=id=>document.getElementById(id);
const LOCAL=['127.0.0.1','localhost'].includes(location.hostname);
if(!LOCAL)$('open').style.display='none';
const esc=s=>s.replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const post=(u,b)=>fetch(u,{method:'POST',body:JSON.stringify(b||{})});
$('go').onclick=async()=>{
  const urls=$('urls').value.split('\n').map(s=>s.trim()).filter(Boolean);
  if(!urls.length){$('urls').focus();return}
  await post('/api/start',{urls,folder:$('folder').value.trim(),quality:document.querySelector('input[name=q]:checked').value});
  $('urls').value='';
};
$('open').onclick=()=>post('/api/open',{folder:$('folder').value.trim()});
$('clear').onclick=()=>post('/api/clear');
async function poll(){
  try{
    const d=await (await fetch('/api/status')).json();
    $('empty').style.display=d.jobs.length?'none':'block';
    $('go').disabled=d.running;
    $('golabel').textContent=d.running?'Converting…':'Convert to MP3';
    $('list').innerHTML=d.jobs.map(j=>{
      let meta=j.status==='Downloading'?Math.round(j.percent)+'%':j.status;
      if(j.status==='Done'&&j.file&&!LOCAL)meta=`<a class="save" href="/file?id=${j.id}">Save ↓</a>`;
      return `<li><div class="fill" style="width:${j.percent}%"></div>
      <div class="row"><span class="name">${esc(j.title)}</span><span class="meta">${meta}</span></div>
      ${j.error?`<div class="err">${esc(j.error)}</div>`:''}</li>`}).join('');
  }catch(e){}
  setTimeout(poll,700);
}
poll();
</script></main></body></html>"""


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def send(self, body, ctype="application/json"):
        data = body.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", ctype + "; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path.startswith("/file"):
            q = parse_qs(urlparse(self.path).query)
            job = next((j for j in JOBS if str(j["id"]) == q.get("id", [""])[0]), None)
            f = Path(job["file"]) if job and job.get("file") else None
            if not f or not f.exists():
                self.send_response(404); self.end_headers(); return
            self.send_response(200)
            self.send_header("Content-Type", "audio/mpeg")
            self.send_header("Content-Length", str(f.stat().st_size))
            self.send_header("Content-Disposition", "attachment; filename*=UTF-8''" + quote(f.name))
            self.end_headers()
            self.wfile.write(f.read_bytes())
            return
        if self.path == "/api/status":
            with LOCK:
                self.send(json.dumps({"running": STATE["running"], "jobs": JOBS}))
        else:
            self.send(PAGE.replace("__FOLDER__", html.escape(DEFAULT_OUTPUT)), "text/html")

    def do_POST(self):
        n = int(self.headers.get("Content-Length", 0))
        req = json.loads(self.rfile.read(n) or "{}")
        if self.path == "/api/start":
            folder = req.get("folder") or DEFAULT_OUTPUT
            Path(folder).mkdir(parents=True, exist_ok=True)
            with LOCK:
                for u in req.get("urls", []):
                    NEXT_ID[0] += 1
                    JOBS.append({"id": NEXT_ID[0], "file": "", "url": u, "title": u, "percent": 0, "status": "Waiting", "error": ""})
                if not STATE["running"]:
                    STATE["running"] = True
                    threading.Thread(target=worker, args=(folder, str(req.get("quality", "2"))),
                                     daemon=True).start()
        elif self.path == "/api/open":
            folder = req.get("folder") or DEFAULT_OUTPUT
            Path(folder).mkdir(parents=True, exist_ok=True)
            if hasattr(os, "startfile"):
                os.startfile(folder)
        elif self.path == "/api/clear":
            with LOCK:
                JOBS[:] = [j for j in JOBS if j["status"] in ("Waiting", "Downloading", "Converting")]
        self.send('{"ok":true}')


def lan_ip():
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as t:
            t.connect(("8.8.8.8", 80))
            return t.getsockname()[0]
    except Exception:
        return None


if __name__ == "__main__":
    server = ThreadingHTTPServer(("0.0.0.0" if ALLOW_PHONE else "127.0.0.1", PORT), Handler)
    url = f"http://127.0.0.1:{PORT}"
    print(f"On this PC:  {url}")
    ip = lan_ip()
    if ALLOW_PHONE and ip:
        print(f"On phone (same Wi-Fi):  http://{ip}:{PORT}")
    print("Press Ctrl+C to stop.")
    threading.Timer(1, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass