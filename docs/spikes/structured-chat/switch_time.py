# Times `mesa sessions view` both ways on a live Claude Code session (#1201): the command, and
# until the new process is ready (Terminal: its SessionStart hook; Structured: its host answers).
# Usage, from the repo root after a build, on a throwaway profile whose session is idle and has a
# conversation, in a folder the TUI already trusts (else Terminal waits on Claude's trust dialog):
# python3 docs/spikes/structured-chat/switch_time.py <profile> <session> <runs>
import json, os, socket, statistics, subprocess, sys, time
PROFILE, ID, N = sys.argv[1], sys.argv[2], int(sys.argv[3])
MESA = ['node', 'packages/cli/dist/mesa.js', '--profile', PROFILE]
EV = os.path.expanduser(f'~/.mesa/{PROFILE}/sessions/events/{ID}.jsonl')
SOCK = os.path.expanduser(f'~/.mesa/{PROFILE}/hosts/{ID}.sock')

def starts():
    try: return sum(1 for l in open(EV) if '"SessionStart"' in l)
    except FileNotFoundError: return 0

def ping():
    try:
        s = socket.socket(socket.AF_UNIX); s.settimeout(1); s.connect(SOCK)
        s.sendall(b'{"type":"ping"}\n'); ok = b'"ok":true' in s.recv(200); s.close(); return ok
    except OSError: return False

def switch(to):
    before = starts(); t0 = time.time()
    r = subprocess.run(MESA + ['sessions', 'view', ID, to, '--json'], capture_output=True, text=True)
    cmd = time.time() - t0
    assert json.loads(r.stdout)['data']['switched'], r.stdout + r.stderr
    while not (ping() if to == 'structured' else starts() > before):
        if time.time() - t0 > 60: raise SystemExit(f'not ready: {to}')
        time.sleep(0.05)
    return cmd, time.time() - t0

res = {'terminal': [], 'structured': []}
for i in range(N):
        for to in ('structured', 'terminal'):
        res[to].append(switch(to)); time.sleep(2)
def q(xs, p): xs = sorted(xs); return xs[min(len(xs) - 1, round(p * (len(xs) - 1)))]
for to, xs in res.items():
    c = [x[0] for x in xs]; r = [x[1] for x in xs]
    print(f'to {to}: command p50 {statistics.median(c):.2f}s p95 {q(c,.95):.2f}s; ready p50 {statistics.median(r):.2f}s p95 {q(r,.95):.2f}s (n={len(xs)})')
