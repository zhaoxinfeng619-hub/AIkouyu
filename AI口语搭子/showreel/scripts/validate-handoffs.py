#!/usr/bin/env python3
"""Validate product-showreel object handoff evidence before full rendering."""

from __future__ import annotations

import json
import sys
from pathlib import Path


REQUIRED_STATES = (
    "before_overlap",
    "overlap_start",
    "main_motion_midpoint",
    "property_transfer",
    "after_overlap",
)
REQUIRED_STATE_FIELDS = (
    "frame",
    "center_x",
    "center_y",
    "width",
    "height",
    "color",
    "content",
    "clip",
    "container",
    "velocity_x",
    "velocity_y",
    "image",
)
ALLOWED_SHARED = {
    "object_identity",
    "position",
    "size",
    "color",
    "content",
    "clip",
    "direction",
    "speed",
    "container_boundary",
}


def fail(messages: list[str]) -> int:
    for message in messages:
        print(f"FAIL: {message}", file=sys.stderr)
    return 1


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: validate-handoffs.py <project-dir>", file=sys.stderr)
        return 64

    project = Path(sys.argv[1]).expanduser().resolve()
    manifest_path = project / "handoff-map.json"
    if not manifest_path.is_file():
        return fail([f"missing {manifest_path}"])

    try:
        data = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        return fail([f"cannot read handoff map: {exc}"])

    errors: list[str] = []
    fps = data.get("fps")
    if not isinstance(fps, (int, float)) or fps <= 0:
        errors.append("fps must be a positive number")

    handoffs = data.get("handoffs")
    if not isinstance(handoffs, list) or not handoffs:
        errors.append("handoffs must contain every adjacent action pair")
        return fail(errors)

    ids: set[str] = set()
    for index, handoff in enumerate(handoffs):
        label = f"handoffs[{index}]"
        if not isinstance(handoff, dict):
            errors.append(f"{label} must be an object")
            continue

        handoff_id = handoff.get("id")
        if not isinstance(handoff_id, str) or not handoff_id.strip():
            errors.append(f"{label}.id is required")
        elif handoff_id in ids:
            errors.append(f"duplicate handoff id: {handoff_id}")
        else:
            ids.add(handoff_id)
            label = handoff_id

        for field in ("from_action", "to_action", "bridge_object_id", "added_product_information"):
            if not isinstance(handoff.get(field), str) or not handoff[field].strip():
                errors.append(f"{label}.{field} is required")

        overlap = handoff.get("overlap")
        if not isinstance(overlap, dict):
            errors.append(f"{label}.overlap is required")
        else:
            start = overlap.get("start_frame")
            end = overlap.get("end_frame")
            if not isinstance(start, int) or not isinstance(end, int) or end < start:
                errors.append(f"{label}.overlap needs valid integer frames")
            elif not 4 <= end - start + 1 <= 12:
                errors.append(f"{label}.overlap must last 4–12 frames")

        shared = handoff.get("shared_attributes")
        if not isinstance(shared, list) or len(set(shared) & ALLOWED_SHARED) < 2:
            errors.append(f"{label} must preserve at least two visible attributes")

        if handoff.get("simultaneous_complete_copies") is not False:
            errors.append(f"{label}.simultaneous_complete_copies must be false")

        states = handoff.get("states")
        if not isinstance(states, list) or len(states) != len(REQUIRED_STATES):
            errors.append(f"{label}.states must contain exactly five boundary states")
            continue

        names = [state.get("name") if isinstance(state, dict) else None for state in states]
        if tuple(names) != REQUIRED_STATES:
            errors.append(f"{label}.states must be ordered as {', '.join(REQUIRED_STATES)}")

        frames: list[int] = []
        for state_index, state in enumerate(states):
            state_label = f"{label}.states[{state_index}]"
            if not isinstance(state, dict):
                errors.append(f"{state_label} must be an object")
                continue
            for field in REQUIRED_STATE_FIELDS:
                if field not in state:
                    errors.append(f"{state_label}.{field} is required")
            frame = state.get("frame")
            if isinstance(frame, int):
                frames.append(frame)
            image = state.get("image")
            if isinstance(image, str) and image.strip():
                image_path = (project / image).resolve()
                try:
                    image_path.relative_to(project)
                except ValueError:
                    errors.append(f"{state_label}.image leaves project directory")
                else:
                    if not image_path.is_file():
                        errors.append(f"{state_label}.image does not exist: {image}")
            else:
                errors.append(f"{state_label}.image must be a project-relative path")

        if len(frames) == len(REQUIRED_STATES) and frames != sorted(frames):
            errors.append(f"{label}.states frames must be non-decreasing")

    if errors:
        return fail(errors)

    print(f"PASS: {len(handoffs)} handoffs with five-frame evidence")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
