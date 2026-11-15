#!/usr/bin/env python3
"""Drive one persistent `claude -p` stream-json process. Usage: claude_stream.py <cwd> <scenario> [session_id]
Prints one line per interesting event with seconds since the prompt was sent. Invented prompts only."""
import json, subprocess, sys, time, os, threading, queue

cwd, scenario = sys.argv[1], sys.argv[2]
resume = sys.argv[3] if len(sys.argv) > 3 else None
args = ["claude", "-p", "--input-format", "stream-json", "--output-format", "stream-json", "--verbose",
        "--include-partial-messages", "--setting-sources", "project", "--permission-prompt-tool", "stdio"]
if resume: args += ["--resume", resume]
p = subprocess.Popen(args, cwd=cwd, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
q = queue.Queue()
threading.Thread(target=lambda: [q.put(l) for l in p.stdout] or q.put(None), daemon=True).start()
t0 = time.time()

def send(o): p.stdin.write(json.dumps(o) + "\n"); p.stdin.flush()
def user(text): send({"type": "user", "message": {"role": "user", "content": text}})

def turn(text, auto_allow=True, interrupt_after=None, tag=""):
    """send one prompt, read until its result; return summary"""
    ts = time.time(); user(text); first = None; deltas = 0; sid = None; out = []; ctl = []
    sent_int = False
    while True:
        try: l = q.get(timeout=120)
        except queue.Empty: print(tag, "TIMEOUT"); return
        if l is None: print(tag, "EOF"); return
        d = json.loads(l); now = time.time() - ts
        t = d.get("type"); st = d.get("subtype")
        if t == "system" and st == "init": sid = d["session_id"]
        if t == "stream_event" and d["event"].get("type") == "content_block_delta":
            deltas += 1; first = first or now
            if interrupt_after and not sent_int and now > interrupt_after:
                send({"type": "control_request", "request_id": "int1", "request": {"subtype": "interrupt"}}); sent_int = True; ctl.append(("interrupt_sent", round(now, 2)))
        if t == "control_request":
            r = d["request"]; ctl.append((r.get("subtype"), r.get("tool_name"), round(now, 2)))
            if r.get("subtype") == "can_use_tool":
                resp = {"behavior": "allow", "updatedInput": r["input"]} if auto_allow else {"behavior": "deny", "message": "no"}
                send({"type": "control_response", "response": {"subtype": "success", "request_id": d["request_id"], "response": resp}})
        if t == "control_response": ctl.append(("ctl_resp", d.get("response", {}).get("subtype"), round(now, 2)))
        if t == "assistant":
            for b in d["message"]["content"]:
                if b["type"] == "text": out.append(b["text"][:200])
                if b["type"] == "tool_use": out.append("TOOL " + b["name"])
        if t == "user" and isinstance(d["message"]["content"], list):
            for b in d["message"]["content"]:
                if b.get("type") == "tool_result": out.append("RESULT " + str(b.get("content"))[:120])
        if t == "system" and st not in ("init", "status", "hook_started", "hook_response", "commands_changed"):
            out.append(f"SYS/{st} {json.dumps({k: v for k, v in d.items() if k not in ('uuid', 'session_id', 'type', 'subtype')})[:200]}")
        if t == "result":
            print(tag, json.dumps({"first_delta_s": first and round(first, 2), "total_s": round(now, 2), "deltas": deltas,
                  "result": str(d.get("result"))[:200], "cost": d.get("total_cost_usd"), "turns": d.get("num_turns"), "ctl": ctl, "out": out}))
            return d

if scenario == "slash":
    for c in ["Remember the code word HARBOR_44. Reply OK.", "/context", "/usage", "/cost", "/model", "/config", "/permissions",
              "/lanternecho foo", "/lantern", "/compact", "/clear", "/context"]:
        turn(c, tag=c)
elif scenario == "perm":
    turn("Create a file named made.txt containing the word tide. Then say done.", tag="allow")
    turn("Create a file named denied.txt containing the word reef. Then say done.", auto_allow=False, tag="deny")
elif scenario == "interrupt":
    turn("Write a 400 word story about a lighthouse keeper.", interrupt_after=1.5, tag="interrupted")
    turn("Reply with exactly: AFTER_INTERRUPT", tag="next")
elif scenario == "resume":
    turn("What code word did I ask you to remember? Answer with only the word.", tag="resumed")
else:
    turn("Remember the code word HARBOR_44. Reply OK.", tag="t1")
p.stdin.close(); p.wait(timeout=30)
