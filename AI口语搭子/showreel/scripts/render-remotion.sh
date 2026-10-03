#!/bin/zsh
set -euo pipefail

if (( $# < 2 )); then
  print -u2 "usage: render-remotion.sh <project-dir> <probe|draft|final> [composition]"
  exit 64
fi

project_dir="${1:A}"
mode="$2"
composition="${3:-}"
runtime_dir="$project_dir"
remotion_bin="$runtime_dir/node_modules/.bin/remotion"
script_dir="${0:A:h}"
timeout_runner="$script_dir/run-with-timeout.py"

[[ -d "$project_dir" ]] || { print -u2 "missing project directory: $project_dir"; exit 66; }
[[ -x "$remotion_bin" ]] || { print -u2 "missing verified Remotion runtime: $remotion_bin"; exit 69; }

entry="src/index.ts"
[[ -f "$project_dir/$entry" ]] || entry="src/index.tsx"
[[ -f "$project_dir/$entry" ]] || { print -u2 "missing Remotion entry under $project_dir/src"; exit 66; }
[[ -x "$timeout_runner" ]] || { print -u2 "missing timeout runner: $timeout_runner"; exit 69; }

cd "$project_dir"

export NODE_PATH="$runtime_dir/node_modules"
export OPENSSL_CONF=/dev/null
if [[ "${AICUT_OUTER_RENDER:-0}" == "1" ]]; then
  render_tmp_dir="$(mktemp -d -t aicut-showreel-render.XXXXXX)"
  [[ -n "$render_tmp_dir" && "$render_tmp_dir" != "/" ]] || exit 70
  trap '[[ -n "${render_tmp_dir:-}" && "${render_tmp_dir:-}" != "/" ]] && rm -rf "$render_tmp_dir"' EXIT
  export TMPDIR="$render_tmp_dir"
else
  export TMPDIR="$project_dir/.render-tmp"
  mkdir -p "$TMPDIR"
fi

common=("$entry")
[[ -n "$composition" ]] && common+=("$composition")

case "$mode" in
  probe)
    probe_log="$project_dir/probe.stderr.log"
    set +e
    PROJECT_DIR="$project_dir" COMPOSITION_ID="$composition" PROBE_LOG="$probe_log" \
      python3 - "$remotion_bin" "$entry" <<'PY'
import os
import subprocess
import sys

command = [sys.argv[1], "compositions", sys.argv[2], "--log", "error"]
try:
    result = subprocess.run(command, text=True, capture_output=True, timeout=30)
except subprocess.TimeoutExpired as error:
    stderr = (error.stderr or "") + "\nprobe timed out after 30 seconds\n"
    open(os.environ["PROBE_LOG"], "w", encoding="utf-8").write(stderr)
    sys.exit(124)
open(os.environ["PROBE_LOG"], "w", encoding="utf-8").write(result.stderr or "")
sys.stdout.write(result.stdout or "")
sys.exit(result.returncode)
PY
    probe_status=$?
    set -e
    if (( probe_status != 0 )); then
      PROJECT_DIR="$project_dir" COMPOSITION_ID="$composition" PROBE_STATUS="$probe_status" PROBE_LOG="$probe_log" \
        python3 - <<'PY'
import json
import os
from pathlib import Path

project = Path(os.environ["PROJECT_DIR"])
log = Path(os.environ["PROBE_LOG"])
summary = log.read_text(encoding="utf-8", errors="replace")[-2000:] if log.exists() else ""
payload = {
    "schema_version": "1.0",
    "status": "OUTER_HARNESS_RENDER_REQUIRED",
    "project_dir": str(project),
    "composition": os.environ.get("COMPOSITION_ID", ""),
    "requested_outputs": ["draft.mp4", "video.mp4"],
    "probe_exit_code": int(os.environ["PROBE_STATUS"]),
    "probe_error_summary": summary,
    "instruction": "Do not explore alternate renderers inside the creative Agent. Render in the verified outer Harness environment.",
}
(project / "render-request.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
PY
      print -u2 "Remotion probe failed; wrote $project_dir/render-request.json"
      exit "$probe_status"
    fi
    ;;
  draft)
    [[ -n "$composition" ]] || { print -u2 "draft requires composition id"; exit 64; }
    "$timeout_runner" 90 "$remotion_bin" render "${common[@]}" "$project_dir/draft.mp4" \
      --codec h264 --crf 28 --scale 0.5 --concurrency 4 --muted --log error --overwrite
    ;;
  final)
    [[ -n "$composition" ]] || { print -u2 "final requires composition id"; exit 64; }
    "$timeout_runner" 300 "$remotion_bin" render "${common[@]}" "$project_dir/silent-preview.mp4" \
      --codec h264 --crf 19 --scale 1.5 --concurrency 4 --muted --log error --overwrite
    "${AICUT_PYTHON:-python3}" scripts/make-audio.py
    node scripts/finalize-audio.mjs
    ;;
  *)
    print -u2 "unknown mode: $mode"
    exit 64
    ;;
esac
