#!/usr/bin/env python3
"""Move applyAgentAction inside CandidateTracker so `candidates` is in scope."""

import re
import sys
from pathlib import Path

target = Path(sys.argv[1] if len(sys.argv) > 1 else "").expanduser()
if not target.is_file():
    print("Usage: python3 fix-candidatetracker-scope.py /Users/.../frontend/src/App.jsx")
    sys.exit(1)

src = target.read_text()
bak = target.with_suffix(target.suffix + f".bak-ct-{int(__import__('time').time())}")
bak.write_text(src)
print("Backup:", bak)

# Extract best applyAgentAction block (+ optional BOT_NAMES/isBotMatch above it)
matches = list(re.finditer(r"(?:async\s+)?function\s+applyAgentAction\b", src))
if not matches:
    print("No applyAgentAction found")
    sys.exit(1)


def extract_block(text, start):
    brace = text.find("{", start)
    depth = 0
    for i in range(brace, len(text)):
        if text[i] == "{":
            depth += 1
        elif text[i] == "}":
            depth -= 1
            if depth == 0:
                return start, i + 1
    return None


blocks = []
for m in matches:
    span = extract_block(src, m.start())
    if not span:
        continue
    start, end = span
    # include helpers immediately above
    pre = src[max(0, start - 900) : start]
    bot = pre.rfind("const BOT_NAMES")
    if bot >= 0:
        abs_bot = max(0, start - 900) + bot
        between = src[abs_bot:start]
        if "function JobsView" not in between and "function CandidateTracker" not in between:
            start = abs_bot
    block = src[start:end]
    score = 0
    if "source_candidates_signalhire" in block:
        score += 5
    if "import_candidate" in block:
        score += 5
    if "taskHint" in block:
        score += 3
    if "addCandidate" in block:
        score += 2
    score += len(block) / 10000
    blocks.append((score, start, end, block))

blocks.sort(reverse=True)
best_score, _, _, best = blocks[0]
print(f"Found {len(blocks)} applyAgentAction block(s); using score {best_score:.2f}")

# Remove all applyAgentAction blocks from end to start
spans = sorted([(s, e, b) for _, s, e, b in blocks], key=lambda x: -x[0])
next_src = src
for s, e, b in spans:
    idx = next_src.find(b)
    if idx >= 0:
        # expand helpers
        pre = next_src[max(0, idx - 900) : idx]
        bot = pre.rfind("const BOT_NAMES")
        cut = idx
        if bot >= 0:
            cut = max(0, idx - 900) + bot
        next_src = next_src[:cut] + next_src[idx + len(b) :]

# Find CandidateTracker and its main return
m = re.search(r"export\s+default\s+function\s+CandidateTracker\s*\(", next_src)
if not m:
    m = re.search(r"function\s+CandidateTracker\s*\(", next_src)
if not m:
    print("Could not find function CandidateTracker")
    sys.exit(1)

# Insert before the last `return (` that appears before the next top-level function
# after CandidateTracker start — typically JobsView or similar, or end of component
start = m.start()
# Find a reasonable window: until "\nfunction " at column 0 after line with only helpers
# CandidateTracker is huge; find return ( that precedes closing of component.
# Heuristic: last "\n  return (" before the first "\nfunction " that appears AFTER
# candidates state and AFTER applyAgentAction was removed — often JobsView is OUTSIDE.
window = next_src[start:]
# End window at next export function or function X that looks like a sibling component
end_rel = None
for mm in re.finditer(r"\nfunction\s+[A-Za-z_]", window):
    # skip nested? these are at beginning of line after newline — in this file helpers
    # after CandidateTracker are like function JobsView
    name_m = re.match(r"\nfunction\s+([A-Za-z_]+)", window[mm.start() :])
    name = name_m.group(1) if name_m else ""
    if name in {
        "JobsView",
        "ResumeTabPanel",
        "ResumeUploadPanel",
        "BoardView",
        "stageMeta",
        "jobStatusMeta",
        "Avatar",
        "ScoreDots",
    }:
        # JobsView etc. are AFTER CandidateTracker in their file? From grep, stageMeta is BEFORE
        # CandidateTracker. So sibling after would be unusual.
        # Continue — look for function at module level after a large chunk
        pass

# Simpler: find last occurrence of "\n  return (" within CandidateTracker by brace matching
brace = next_src.find("{", m.end())
depth = 0
comp_end = None
for i in range(brace, len(next_src)):
    if next_src[i] == "{":
        depth += 1
    elif next_src[i] == "}":
        depth -= 1
        if depth == 0:
            comp_end = i
            break
if comp_end is None:
    print("Could not find end of CandidateTracker")
    sys.exit(1)

section = next_src[start:comp_end]
ret = section.rfind("\n  return (")
if ret < 0:
    ret = section.rfind("\n  return(")
if ret < 0:
    print("Could not find return ( inside CandidateTracker")
    sys.exit(1)

abs_ret = start + ret
injection = "\n\n  " + best.strip() + "\n\n"
next_src = next_src[:abs_ret] + injection + next_src[abs_ret:]

# Fix await call sites
next_src = re.sub(
    r"async\s+function\s+await\s+applyAgentAction",
    "async function applyAgentAction",
    next_src,
)
next_src = re.sub(
    r"(?<!function )(?<!async function )(?<!await )\bapplyAgentAction\s*\(\s*action\s*\)",
    "await applyAgentAction(action)",
    next_src,
)
next_src = next_src.replace("await await applyAgentAction", "await applyAgentAction")

# Verify applyAgentAction is now between CandidateTracker and its end
ct = next_src.find("function CandidateTracker")
fn = next_src.find("async function applyAgentAction")
if fn < 0:
    fn = next_src.find("function applyAgentAction")
# rough check
print("CandidateTracker at", ct, "applyAgentAction at", fn)
if not (ct < fn):
    print("WARN: applyAgentAction may still be outside CandidateTracker")

target.write_text(next_src)
print("Wrote", target)
print("Next: cd ~/lyday-gina-backend/gina-backend/frontend && npm run build")
