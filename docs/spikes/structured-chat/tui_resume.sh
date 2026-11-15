#!/bin/bash
# Usage: tui_resume.sh <project dir> <session id> <runs>. Times `claude --resume` in a private tmux server until the prompt box shows.
dir=$1; sid=$2; runs=${3:-3}
t() { tmux -L spikechat "$@"; }
t kill-server 2>/dev/null
for i in $(seq 1 "$runs"); do
  t new-session -d -s s$i -x 120 -y 40 -c "$dir" "claude --resume $sid --setting-sources project"
  a=$(python3 -c "import time;print(time.time())")
  for n in $(seq 1 300); do
    cap=$(t capture-pane -p -t s$i)
    echo "$cap" | grep -qi "trust this folder" && t send-keys -t s$i Down Enter
    echo "$cap" | grep -q "shift+tab" && break
    sleep 0.1
  done
  b=$(python3 -c "import time;print(time.time())")
  echo "tui ready $(python3 -c "print(round($b-$a,2))")s"
  if [ "$i" = 1 ]; then
    t send-keys -t s$i "What code word did I ask you to remember? Answer with only the word." Enter; sleep 9
    t capture-pane -p -t s$i | grep -v '^\s*$' | tail -6
  fi
  t kill-session -t s$i
done
t kill-server 2>/dev/null
