#!/usr/bin/env python3
"""Drive `codex app-server` (stdio JSON-RPC). Usage: codex_appserver.py <cwd> <scenario> [thread_id].
CODEX_HOME must be a throwaway. Prints method names and timings only, never account numbers. Invented prompts."""
import json, subprocess, sys, time, queue, threading

cwd, scenario = sys.argv[1], sys.argv[2]
tid = sys.argv[3] if len(sys.argv) > 3 else None
t_spawn = time.time()
p = subprocess.Popen(["codex", "app-server"], cwd=cwd, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                     stderr=subprocess.DEVNULL, text=True)
q = queue.Queue()
threading.Thread(target=lambda: [q.put(l) for l in p.stdout] or q.put(None), daemon=True).start()
nid = [0]
turn_id = [None]


def send(o):
    p.stdin.write(json.dumps(o) + "\n")
    p.stdin.flush()


def req(method, params, stop=None, timeout=90, interrupt_at=None):
    """Send one request; auto-accept approval requests; return (result, notification counts, first delta s, seconds)."""
    nid[0] += 1
    i = nid[0]
    t = time.time()
    send({"id": i, "method": method, "params": params})
    res = None
    seen = {}
    first = None
    sent_int = False
    while True:
        try:
            l = q.get(timeout=timeout)
        except queue.Empty:
            return res, seen, first, "TIMEOUT"
        d = json.loads(l)
        m = d.get("method")
        if m is None and d.get("id") == i:
            res = d.get("result", d.get("error"))
        elif m and "id" in d:  # a server request: approvals
            seen[m] = seen.get(m, 0) + 1
            send({"id": d["id"], "result": {"decision": "accept"}})
        elif m:
            seen[m] = seen.get(m, 0) + 1
            if m == "turn/started":
                turn_id[0] = d["params"]["turn"]["id"]
            if m == "item/agentMessage/delta" and first is None:
                first = round(time.time() - t, 2)
            if interrupt_at and m == "item/agentMessage/delta" and not sent_int and time.time() - t > interrupt_at:
                nid[0] += 1
                send({"id": nid[0], "method": "turn/interrupt", "params": {"threadId": params["threadId"], "turnId": turn_id[0]}})
                sent_int = True
                seen["INTERRUPT_SENT"] = 1
            if stop and m == stop:
                return res, seen, first, round(time.time() - t, 2)
        if stop is None and res is not None:
            return res, seen, first, round(time.time() - t, 2)


def ask(text, tag, **kw):
    r, seen, first, dt = req("turn/start", {"threadId": tid, "input": [{"type": "text", "text": text}]},
                             stop="turn/completed", **kw)
    print(tag, "first_delta", first, "total", dt, {k: v for k, v in seen.items() if not k.startswith(("thread/tokenUsage", "account/"))})


req("initialize", {"clientInfo": {"name": "spike", "version": "0"}, "capabilities": {"experimentalApi": True}})
print("initialize done, s since spawn", round(time.time() - t_spawn, 2))
if scenario == "start":
    r, _, _, dt = req("thread/start", {"cwd": cwd, "approvalPolicy": "on-request", "sandbox": "workspace-write"})
    tid = r["thread"]["id"]
    print("thread/start", dt, tid)
    ask("Remember the code word HARBOR_44. Reply OK.", "t1")
    ask("Create a file named made.txt containing the word tide, then say done.", "write+approval")
    ask("Write a 400 word story about a lighthouse keeper.", "interrupt", interrupt_at=1.5)
    ask("Reply with exactly: AFTER_INTERRUPT", "next")
    for m, prm in [("skills/list", {"cwds": [cwd]}), ("model/list", {}), ("account/usage/read", {}), ("account/rateLimits/read", {})]:
        r, _, _, dt = req(m, prm)
        print(m, dt, "keys", list(r.keys()) if isinstance(r, dict) else r)
    r, seen, _, dt = req("thread/compact/start", {"threadId": tid}, stop="thread/compacted")
    print("compact", dt)
elif scenario == "resume":
    r, _, _, dt = req("thread/resume", {"threadId": tid, "cwd": cwd})
    print("thread/resume", dt)
    ask("What code word did I ask you to remember? Answer with only the word.", "resumed")
p.stdin.close()
p.wait(timeout=20)
