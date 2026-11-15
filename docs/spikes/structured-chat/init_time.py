#!/usr/bin/env python3
"""Seconds from spawn to system/init for `claude -p --input-format stream-json --resume <sid>`, N runs. Usage: init_time.py <cwd> <sid> <n>"""
import subprocess, json, sys, time
cwd, sid, n = sys.argv[1], sys.argv[2], int(sys.argv[3]); ts = []
for _ in range(n):
    t = time.time()
    p = subprocess.Popen(["claude", "-p", "--input-format", "stream-json", "--output-format", "stream-json", "--verbose",
                          "--setting-sources", "project", "--resume", sid], cwd=cwd, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
    # init is only emitted after the first user message in this version, so send a slash command that costs no tokens
    p.stdin.write(json.dumps({"type": "user", "message": {"role": "user", "content": "/model"}}) + "\n"); p.stdin.flush()
    for l in p.stdout:
        if json.loads(l).get("subtype") == "init": ts.append(time.time() - t); break
    p.stdin.close(); p.wait()
ts.sort(); print("init s:", [round(x, 2) for x in ts], "p50", round(ts[len(ts)//2], 2), "p95", round(ts[min(len(ts)-1, int(len(ts)*.95))], 2))
