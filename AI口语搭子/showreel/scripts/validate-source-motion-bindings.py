#!/usr/bin/env python3
"""Bind declared Showreel actions to rendered JSX/SVG objects and expressions."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path


def fail(messages: list[str]) -> int:
    for message in messages:
        print(f"FAIL: {message}", file=sys.stderr)
    return 1


def without_comments(source: str) -> str:
    source = re.sub(r"/\*.*?\*/", "", source, flags=re.S)
    source = re.sub(r"(^|\s)//[^\n]*", r"\1", source)
    return source


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: validate-source-motion-bindings.py <project-dir>", file=sys.stderr)
        return 64

    project = Path(sys.argv[1]).expanduser().resolve()
    map_path = project / "product-motion-map.json"
    if not map_path.is_file():
        return fail([f"missing {map_path}"])
    try:
        data = json.loads(map_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        return fail([f"cannot read product motion map: {exc}"])

    errors: list[str] = []
    source_cache: dict[Path, str] = {}
    object_owners: dict[tuple[Path, str], set[str]] = {}
    for index, action in enumerate(data.get("actions", [])):
        if not isinstance(action, dict):
            continue
        action_id = action.get("id", f"actions[{index}]")
        binding = action.get("source_binding")
        if not isinstance(binding, dict):
            errors.append(f"{action_id}.source_binding is required")
            continue
        relative = binding.get("source_file")
        marker = binding.get("object_marker")
        if not isinstance(relative, str) or not relative.strip() or not isinstance(marker, str) or not marker.strip():
            errors.append(f"{action_id} needs source_file and object_marker")
            continue
        source_path = (project / relative).resolve()
        try:
            source_path.relative_to(project)
        except ValueError:
            errors.append(f"{action_id}.source_file leaves project directory")
            continue
        if not source_path.is_file():
            errors.append(f"{action_id}.source_file does not exist: {relative}")
            continue
        if source_path not in source_cache:
            source_cache[source_path] = without_comments(source_path.read_text(encoding="utf-8", errors="replace"))
        source = source_cache[source_path]
        marker_patterns = (
            f'data-motion-object="{marker}"',
            f"data-motion-object='{marker}'",
        )
        if not any(pattern in source for pattern in marker_patterns):
            errors.append(f"{action_id} object marker is not attached to rendered JSX/SVG: {marker}")
        object_owners.setdefault((source_path, marker), set()).add(str(action_id))

        properties = binding.get("animated_properties")
        if not isinstance(properties, list) or not properties:
            errors.append(f"{action_id} needs animated_properties")
        markers = binding.get("expression_markers")
        if not isinstance(markers, list) or not markers:
            errors.append(f"{action_id} needs expression_markers")
            continue
        for expression in markers:
            if not isinstance(expression, str) or not expression.strip():
                errors.append(f"{action_id} has an empty expression marker")
                continue
            count = source.count(expression)
            if count < 2:
                errors.append(
                    f"{action_id} expression marker must occur in both definition and rendered property: {expression} (found {count})"
                )

    if errors:
        return fail(errors)
    print(f"PASS: {len(data.get('actions', []))} actions bind to rendered source objects and expressions")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
