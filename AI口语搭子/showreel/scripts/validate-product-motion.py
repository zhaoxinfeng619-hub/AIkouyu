#!/usr/bin/env python3
"""Validate frame-level product-motion coverage before rendering a Showreel."""

from __future__ import annotations

import json
import sys
from pathlib import Path


LAYERS = {"camera", "product_carrier", "interface_response", "follow_through"}
ACTION_FIELDS = {
    "id",
    "layer",
    "object_id",
    "start_frame",
    "end_frame",
    "visible_change",
    "product_information_change",
    "events",
    "source_binding",
}
HOLD_FIELDS = {"id", "start_frame", "end_frame", "product_result", "next_action_id"}


def fail(messages: list[str]) -> int:
    for message in messages:
        print(f"FAIL: {message}", file=sys.stderr)
    return 1


def frame_of(event: object) -> int | None:
    if isinstance(event, dict) and isinstance(event.get("frame"), int):
        return event["frame"]
    return None


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: validate-product-motion.py <project-dir>", file=sys.stderr)
        return 64

    project = Path(sys.argv[1]).expanduser().resolve()
    source = project / "product-motion-map.json"
    if not source.is_file():
        return fail([f"missing {source}"])

    try:
        data = json.loads(source.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        return fail([f"cannot read product motion map: {exc}"])

    errors: list[str] = []
    fps = data.get("fps")
    duration = data.get("duration_in_frames")
    if not isinstance(fps, int) or fps <= 0:
        errors.append("fps must be a positive integer")
    if not isinstance(duration, int) or duration <= 0:
        errors.append("duration_in_frames must be a positive integer")
        return fail(errors)

    actions = data.get("actions")
    if not isinstance(actions, list) or not actions:
        return fail(errors + ["actions must be a non-empty list"])

    by_id: dict[str, dict] = {}
    all_events: set[int] = set()
    covered = [False] * duration
    for index, action in enumerate(actions):
        label = f"actions[{index}]"
        if not isinstance(action, dict):
            errors.append(f"{label} must be an object")
            continue
        missing = ACTION_FIELDS - action.keys()
        if missing:
            errors.append(f"{label} missing fields: {', '.join(sorted(missing))}")
            continue
        action_id = action.get("id")
        if not isinstance(action_id, str) or not action_id.strip():
            errors.append(f"{label}.id must be a non-empty string")
            continue
        if action_id in by_id:
            errors.append(f"duplicate action id: {action_id}")
            continue
        by_id[action_id] = action
        if action.get("layer") not in LAYERS:
            errors.append(f"{action_id}.layer must be one of {', '.join(sorted(LAYERS))}")
        for field in ("object_id", "visible_change", "product_information_change"):
            if not isinstance(action.get(field), str) or not action[field].strip():
                errors.append(f"{action_id}.{field} must be a non-empty string")
        start = action.get("start_frame")
        end = action.get("end_frame")
        if not isinstance(start, int) or not isinstance(end, int) or not 0 <= start <= end < duration:
            errors.append(f"{action_id} has invalid frame interval")
            continue
        for frame in range(start, end + 1):
            covered[frame] = True
        events = action.get("events")
        if not isinstance(events, list) or not events:
            errors.append(f"{action_id}.events must contain frame-level visible changes")
            continue
        local_frames: list[int] = []
        for event_index, event in enumerate(events):
            frame = frame_of(event)
            if frame is None:
                errors.append(f"{action_id}.events[{event_index}] needs an integer frame")
                continue
            if not start <= frame <= end:
                errors.append(f"{action_id}.events[{event_index}] leaves its action interval")
            change = event.get("visible_change") if isinstance(event, dict) else None
            if not isinstance(change, str) or not change.strip():
                errors.append(f"{action_id}.events[{event_index}].visible_change is required")
            local_frames.append(frame)
            all_events.add(frame)

        binding = action.get("source_binding")
        if not isinstance(binding, dict):
            errors.append(f"{action_id}.source_binding must be an object")
        else:
            for field in ("source_file", "object_marker"):
                if not isinstance(binding.get(field), str) or not binding[field].strip():
                    errors.append(f"{action_id}.source_binding.{field} must be a non-empty string")
            properties = binding.get("animated_properties")
            if not isinstance(properties, list) or not properties or not all(isinstance(item, str) and item.strip() for item in properties):
                errors.append(f"{action_id}.source_binding.animated_properties must be a non-empty string list")
            markers = binding.get("expression_markers")
            if not isinstance(markers, list) or not markers or not all(isinstance(item, str) and item.strip() for item in markers):
                errors.append(f"{action_id}.source_binding.expression_markers must be a non-empty string list")
        local_frames = sorted(set(local_frames))
        for left, right in zip(local_frames, local_frames[1:]):
            if right - left > 9:
                errors.append(f"{action_id} has {right-left-1} frames without a registered event between F{left} and F{right}")

    holds = data.get("result_holds", [])
    if not isinstance(holds, list):
        errors.append("result_holds must be a list")
        holds = []
    hold_ranges: list[tuple[int, int]] = []
    for index, hold in enumerate(holds):
        label = f"result_holds[{index}]"
        if not isinstance(hold, dict):
            errors.append(f"{label} must be an object")
            continue
        missing = HOLD_FIELDS - hold.keys()
        if missing:
            errors.append(f"{label} missing fields: {', '.join(sorted(missing))}")
            continue
        start = hold.get("start_frame")
        end = hold.get("end_frame")
        if not isinstance(start, int) or not isinstance(end, int) or not 0 <= start <= end < duration:
            errors.append(f"{label} has invalid frame interval")
            continue
        length = end - start + 1
        if not 9 <= length <= 18:
            errors.append(f"{label} must last 9–18 frames")
        next_id = hold.get("next_action_id")
        if next_id not in by_id:
            errors.append(f"{label}.next_action_id does not name an action")
        else:
            next_start = by_id[next_id].get("start_frame")
            lead = end - next_start
            if not isinstance(next_start, int) or not 4 <= lead <= 12:
                errors.append(f"{label} must start its next action 4–12 frames before the hold ends")
        if not isinstance(hold.get("product_result"), str) or not hold["product_result"].strip():
            errors.append(f"{label}.product_result must be a non-empty string")
        hold_ranges.append((start, end))

    chain = data.get("continuity_chain")
    if not isinstance(chain, list) or len(chain) < 2:
        errors.append("continuity_chain must contain at least two primary action ids")
    else:
        if len(chain) != len(set(chain)):
            errors.append("continuity_chain must not repeat action ids")
        for action_id in chain:
            if action_id not in by_id:
                errors.append(f"continuity_chain names missing action: {action_id}")
        valid_chain = [by_id[action_id] for action_id in chain if action_id in by_id]
        for current, following in zip(valid_chain, valid_chain[1:]):
            overlap = current["end_frame"] - following["start_frame"] + 1
            if not 4 <= overlap <= 12:
                errors.append(
                    f"continuity_chain {current['id']} -> {following['id']} must overlap 4–12 frames; got {overlap}"
                )

    # A declared result hold is the only legal exception to product-action coverage.
    allowed = covered[:]
    for start, end in hold_ranges:
        for frame in range(start, end + 1):
            allowed[frame] = True
    gap_start: int | None = None
    for frame, active in enumerate(allowed + [True]):
        if not active and gap_start is None:
            gap_start = frame
        elif active and gap_start is not None:
            gap_end = frame - 1
            if gap_end - gap_start + 1 > 8:
                errors.append(f"F{gap_start}–F{gap_end} has more than 8 frames without product motion or a declared result hold")
            gap_start = None

    sorted_events = sorted(all_events)
    for left, right in zip(sorted_events, sorted_events[1:]):
        if right - left <= 9:
            continue
        gap = range(left + 1, right)
        if not gap or not all(any(start <= frame <= end for start, end in hold_ranges) for frame in gap):
            errors.append(f"global product events leave F{left+1}–F{right-1} without an event")

    if errors:
        return fail(errors)
    print(f"PASS: {len(actions)} product actions cover {duration} frames with registered overlap and result holds")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
