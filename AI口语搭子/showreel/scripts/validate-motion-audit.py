#!/usr/bin/env python3
"""Reject near-static product-motion gaps in a background-disabled audit video."""

from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path


START_RE = re.compile(r"freeze_start:\s*([0-9.]+)")
END_RE = re.compile(r"freeze_end:\s*([0-9.]+)")


def fail(messages: list[str]) -> int:
    for message in messages:
        print(f"FAIL: {message}", file=sys.stderr)
    return 1


def main() -> int:
    if len(sys.argv) != 3:
        print("usage: validate-motion-audit.py <motion-audit.mp4> <product-motion-map.json>", file=sys.stderr)
        return 64

    video = Path(sys.argv[1]).expanduser().resolve()
    motion_map = Path(sys.argv[2]).expanduser().resolve()
    if not video.is_file() or not motion_map.is_file():
        return fail(["motion audit video and product-motion-map.json must exist"])

    try:
        data = json.loads(motion_map.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        return fail([f"cannot read motion map: {exc}"])
    fps = data.get("fps")
    duration = data.get("duration_in_frames")
    if not isinstance(fps, int) or fps <= 0 or not isinstance(duration, int) or duration <= 0:
        return fail(["motion map needs positive integer fps and duration_in_frames"])

    probe = subprocess.run(
        [
            "ffprobe", "-v", "error", "-select_streams", "v:0",
            "-show_entries", "stream=nb_frames,r_frame_rate", "-of", "json", str(video),
        ],
        text=True,
        capture_output=True,
    )
    if probe.returncode != 0:
        return fail([probe.stderr.strip() or "ffprobe failed"])
    stream = json.loads(probe.stdout)["streams"][0]
    if stream.get("r_frame_rate") != f"{fps}/1" or int(stream.get("nb_frames", 0)) != duration:
        return fail(["motion audit video fps or frame count does not match product-motion-map.json"])

    minimum_seconds = 8 / fps
    check = subprocess.run(
        [
            "ffmpeg", "-hide_banner", "-loglevel", "info", "-i", str(video),
            "-vf", f"freezedetect=n=-42dB:d={minimum_seconds:.6f}",
            "-an", "-f", "null", "-",
        ],
        text=True,
        capture_output=True,
    )
    if check.returncode != 0:
        return fail(["ffmpeg freezedetect failed"])

    starts = [float(value) for value in START_RE.findall(check.stderr)]
    ends = [float(value) for value in END_RE.findall(check.stderr)]
    if len(starts) > len(ends):
        ends.append(duration / fps)

    holds = [
        (int(hold["start_frame"]), int(hold["end_frame"]))
        for hold in data.get("result_holds", [])
        if isinstance(hold, dict) and isinstance(hold.get("start_frame"), int) and isinstance(hold.get("end_frame"), int)
    ]
    errors: list[str] = []
    for start_seconds, end_seconds in zip(starts, ends):
        start_frame = round(start_seconds * fps)
        end_frame = round(end_seconds * fps)
        if end_frame - start_frame + 1 <= 8:
            continue
        permitted = any(start_frame >= hold_start - 1 and end_frame <= hold_end + 1 for hold_start, hold_end in holds)
        if not permitted:
            errors.append(
                f"F{start_frame}–F{end_frame} is near-static outside a declared 9–18 frame result hold"
            )

    if errors:
        return fail(errors)
    print(f"PASS: no undeclared product-motion freeze longer than 8 frames in {video.name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
