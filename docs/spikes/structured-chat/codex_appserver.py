#!/usr/bin/env python3
"""Drive `codex app-server` (stdio JSON-RPC). Usage: codex_appserver.py <cwd> start|approval|steer|latency|compact|hooks|resume [thread_id].
Env: DECISION=accept|decline (approvals), POLICY (approval scenario), RUNS (latency), TRUST=1 (hooks), TRACE=1 (print requests and hook notes).
CODEX_HOME must be a throwaway. Prints method names and timings only, never account numbers. Invented prompts."""
import json, os, statistics, subprocess, sys, time, queue, threading
DECISION = os.environ.get("DECISION", "accept")  # accept | decline, the answer to every approval request

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
            if os.environ.get("TRACE"):
                print("  server request", m, json.dumps(d["params"])[:160])
            send({"id": d["id"], "result": {"decision": DECISION}})
        elif m:
            seen[m] = seen.get(m, 0) + 1
            if os.environ.get("TRACE") and m.startswith(("hook/", "item/completed", "turn/completed", "thread/compacted")):
                print("  note", m, json.dumps(d["params"])[:200])
            if m == "turn/started":
                turn_id[0] = d["params"]["turn"]["id"]
            if m == "item/agentMessage/delta" and first is None:
                first = round(time.time() - t, 2)
            if interrupt_at and m == "item/agentMessage/delta" and not sent_int and time.time() - t > interrupt_at:
                nid[0] += 1
                send({"id": nid[0], "method": "turn/interrupt", "params": {"threadId": params["threadId"], "turnId": turn_id[0]}})
                sent_int = True
                t_int = time.time()
                seen["INTERRUPT_SENT"] = 1
            if stop and m == stop:
                if sent_int:
                    seen["interrupt_to_completed_s"] = round(time.time() - t_int, 3)
                    seen["turn_status"] = d["params"]["turn"].get("status")
                return res, seen, first, round(time.time() - t, 2)
        if stop is None and res is not None:
            return res, seen, first, round(time.time() - t, 2)


def ask(text, tag, **kw):
    r, seen, first, dt = req("turn/start", {"threadId": tid, "input": [{"type": "text", "text": text}]},
                             stop="turn/completed", **kw)
    print(tag, "first_delta", first, "total", dt, {k: v for k, v in seen.items() if not k.startswith(("thread/tokenUsage", "account/"))})


def start_thread(policy, sandbox):
    r, _, _, _ = req("thread/start", {"cwd": cwd, "approvalPolicy": policy, "sandbox": sandbox})
    return r["thread"]["id"]


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
    r, seen, _, dt = req("thread/compact/start", {"threadId": tid}, stop="turn/completed", timeout=120)
    print("compact", dt)
elif scenario == "approval":
    policy = os.environ.get("POLICY", "untrusted")
    tid = start_thread(policy, "workspace-write")
    print("thread/start", policy, tid)
    ask("Run the shell command `echo tide > made.txt` and then say done.", "approval-" + DECISION)
    print("made.txt exists:", os.path.exists(os.path.join(cwd, "made.txt")))
elif scenario == "steer":
    tid = start_thread("never", "read-only")
    nid[0] += 1
    send({"id": nid[0], "method": "turn/start", "params": {"threadId": tid, "input": [{"type": "text", "text": "Count slowly from 1 to 60, one number per line, no other text."}]}})
    t0 = time.time()
    steered = False
    text = ""
    while True:
        d = json.loads(q.get(timeout=90))
        m = d.get("method")
        if m == "turn/started":
            turn_id[0] = d["params"]["turn"]["id"]
        if m == "item/agentMessage/delta":
            text += d["params"].get("delta", "")
            if not steered and time.time() - t0 > 3:
                nid[0] += 1
                ts = time.time()
                send({"id": nid[0], "method": "turn/steer", "params": {"threadId": tid, "expectedTurnId": turn_id[0], "input": [{"type": "text", "text": "Stop counting and instead reply with exactly: STEERED"}]}})
                steer_id, steered = nid[0], True
        if steered and m is None and d.get("id") == steer_id:
            print("turn/steer ack s", round(time.time() - ts, 3), json.dumps(d.get("result", d.get("error")))[:120])
        if m == "turn/completed":
            break
    print("steered turn total s", round(time.time() - t0, 2), "same turn id kept; ends with:", repr(text[-60:]))
elif scenario == "latency":
    ts = []
    for i in range(int(os.environ.get("RUNS", "8"))):
        tid = start_thread("never", "read-only")
        _, seen, first, dt = req("turn/start", {"threadId": tid, "input": [{"type": "text", "text": "Reply with exactly: OK"}]}, stop="turn/completed")
        ts.append(first)
        print("run", i, "first_delta", first, "total", dt)
    ts.sort()
    print("first delta p50", statistics.median(ts), "p95", ts[min(len(ts) - 1, int(0.95 * len(ts) + 0.5) - 1)], "n", len(ts))
elif scenario == "compact":
    tid = start_thread("never", "read-only")
    print("thread", tid)
    ask("Remember the code word HARBOR_44. Reply OK.", "t1")
    ask("Name three tides. Reply briefly.", "t2")
    r, seen, _, dt = req("thread/compact/start", {"threadId": tid}, stop="turn/completed", timeout=120)
    print("compact", dt, "result", json.dumps(r)[:80], {k: v for k, v in seen.items() if not k.startswith("mcp")})
    ask("What code word did I ask you to remember? Answer with only the word.", "after-compact")
elif scenario == "hooks":
    home = os.environ["CODEX_HOME"]
    log = os.path.join(home, "hooks.log")
    hook = {"hooks": [{"type": "command", "command": f"python3 -c \"import sys,json;print(json.load(sys.stdin)['hook_event_name'])\" >> {log}"}]}
    if not os.path.exists(os.path.join(home, "hooks.json")):  # a logging hook per event, in Claude's JSON shape
        with open(os.path.join(home, "hooks.json"), "w") as fh:
            json.dump({"hooks": {e: [hook] for e in ["SessionStart", "UserPromptSubmit", "PermissionRequest", "Stop"]}}, fh)
    r, _, _, _ = req("hooks/list", {"cwds": [cwd]})
    hs = [h for e in r["data"] for h in e["hooks"]]
    print("hooks/list", len(hs), "hooks; fields", sorted(hs[0].keys()) if hs else None)
    for h in hs:
        print("  ", h.get("eventName"), h.get("trustStatus"), h.get("key"))
    if os.environ.get("TRUST"):
        edits = [{"keyPath": "hooks.state", "mergeStrategy": "upsert",
                  "value": {h["key"]: {"trusted_hash": h["currentHash"]} for h in hs}}]
        r, _, _, _ = req("config/batchWrite", {"edits": edits, "reloadUserConfig": True})
        print("config/batchWrite", json.dumps(r)[:100])
    tid = start_thread("untrusted", "workspace-write")
    ask("Run the shell command `echo tide > made.txt` and then say done.", "turn-with-hooks")
    print("hooks that ran:", open(log).read().split() if os.path.exists(log) else [])
elif scenario == "resume":
    r, _, _, dt = req("thread/resume", {"threadId": tid, "cwd": cwd})
    print("thread/resume", dt)
    ask("What code word did I ask you to remember? Answer with only the word.", "resumed")
p.stdin.close()
p.wait(timeout=20)
