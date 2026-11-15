# Delta latency of `mesa chat --follow` (#1201): each journal append of a text delta (seen by
# polling the file's size every 2 ms) to the first follow line printed after it. From the repo root
# after a build, on a throwaway profile with a running Structured session:
# python3 docs/spikes/structured-chat/follow_latency.py <profile> <session> "<a prompt with a long reply>"
import os, subprocess, sys, threading, time
profile, sid, prompt = sys.argv[1:4]
journal = os.path.expanduser(f'~/.mesa/{profile}/sessions/journals/{sid}.jsonl')
env = {**os.environ, 'MESA_PROFILE': profile}
follow = subprocess.Popen(['node', 'packages/cli/dist/mesa.js', 'chat', sid, '--follow'], env=env,
                          stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
emitted = []
def read():
    for _ in follow.stdout:
        emitted.append(time.monotonic())
threading.Thread(target=read, daemon=True).start()
time.sleep(1.5)
writes = []; offset = os.path.getsize(journal); stop = False
def watch():
    global offset
    while not stop:
        size = os.path.getsize(journal)
        if size > offset:
            with open(journal) as f:
                f.seek(offset); chunk = f.read(size - offset)
            offset = size; now = time.monotonic()
            writes.extend(now for l in chunk.splitlines() if '"text_delta"' in l)
        time.sleep(0.002)
threading.Thread(target=watch, daemon=True).start()
subprocess.run(['node', 'packages/cli/dist/mesa.js', 'send', sid, prompt], env=env, capture_output=True)
time.sleep(25); stop = True
follow.stdin.close(); follow.wait(timeout=10)
lat = sorted(min((e - w for e in emitted if e >= w), default=float('inf')) * 1000 for w in writes)
lat = [x for x in lat if x != float('inf')]
q = lambda p: lat[min(len(lat) - 1, round(p * (len(lat) - 1)))]
print(f'deltas={len(writes)} measured={len(lat)} p50={q(.5):.0f}ms p95={q(.95):.0f}ms max={lat[-1]:.0f}ms')
