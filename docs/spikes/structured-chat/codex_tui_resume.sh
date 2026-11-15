#!/bin/bash
# Usage: codex_tui_resume.sh <project dir> <thread id> <runs>. Times `codex -c mesa.embedded=true resume <id>` (Mesa's own command line, kept off any daemon) in a private tmux server until the prompt shows.
# CODEX_HOME must be a throwaway. Asks the code word in the first run to show the conversation survived.
dir=$1; tid=$2; runs=${3:-3}
t() { tmux -L spikecodex "$@"; }
t kill-server 2>/dev/null
for i in $(seq 1 "$runs"); do
  t new-session -d -s s$i -x 120 -y 40 -c "$dir" "codex -c mesa.embedded=true resume $tid"
  a=$(python3 -c "import time;print(time.time())")
  for n in $(seq 1 300); do
    cap=$(t capture-pane -p -t s$i)
    echo "$cap" | grep -qi "trust the contents" && t send-keys -t s$i Enter
    echo "$cap" | grep -q "for shortcuts" && break
    sleep 0.1
  done
  b=$(python3 -c "import time;print(time.time())")
  echo "tui ready $(python3 -c "print(round($b-$a,2))")s"
  if [ "$i" = 1 ]; then
    t send-keys -t s$i "What code word did I ask you to remember? Answer with only the word."; sleep 0.5; t send-keys -t s$i Enter; sleep 15
    t capture-pane -p -t s$i | grep -v '^\s*$' | tail -8
  fi
  t kill-session -t s$i
done
t kill-server 2>/dev/null
