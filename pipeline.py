"""
run_aider.py — Sequentially run numbered aider prompts, commit results, and
               track progress in site/docs/project-state.md.
"""

import logging
import re
import subprocess
import sys
import time
from pathlib import Path
import os

# ── Configuration ──────────────────────────────────────────────────────────────
MODEL             = "openai/minimaxai/minimax-m3"
LOCK_FILE         = Path(".aider-run.lock")
BASE_RETRY_DELAY  = 60
MAX_RETRY_DELAY   = 300
POST_COMMIT_SLEEP = 15
AIDER_TIMEOUT_S   = 360
PIPELINE_MANAGED  = {"site/docs/project-state.md"}   # never content-checked
os.environ["LITELLM_LOG"] = "DEBUG"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

log.info(
    "Repository root: %s",
    subprocess.check_output(["git", "rev-parse", "--show-toplevel"]).decode().strip()
)

# ── Wholefile format instructions ─────────────────────────────────────────────
FORMAT_PREFIX = """\
=== MANDATORY OUTPUT FORMAT ===

Output ONLY file blocks. No preamble, no explanation, no decoration.

For EACH file write EXACTLY this pattern:

<file path, e.g. site/docs/architecture.md>
```
<COMPLETE file content — every line — in one block>
```

CRITICAL RULES:
- Write ALL content in ONE response. Do NOT say "continued below" or expect
  to send more messages. Everything must be in THIS response.
- Filename line: no backticks, no bold, no leading spaces, nothing else.
- Fences: only ``` — never ~~~.
- No unicode box/table chars: ─ │ ┌ ┐ └ ┘ ├ ┤ ┬ ┴ ┼ ━ ┃ etc.
- Nothing before the first filename line.
- Be CONCISE. Aim for quality over length. Under 400 lines per file.

=== TASK ===

"""

# ── Prompt / file map ──────────────────────────────────────────────────────────
PROMPT_FILES: dict[str, dict[str, list[str]]] = {
    "00": {"edit": ["site/docs/global-rules.md","site/docs/project-state.md"], "read": []},
    "01": {"edit": ["site/docs/architecture.md","site/docs/project-state.md"], "read": ["site/docs/global-rules.md"]},
    "02": {"edit": ["site/assets/css/style.css","site/docs/project-state.md"], "read": ["site/docs/architecture.md"]},
    "03": {
        "edit": ["site/index.html","site/docs/project-state.md"],
        "read": ["site/docs/architecture.md","site/assets/css/style.css"],
    },
    "04": {
        "edit": ["site/services.html","site/docs/project-state.md"],
        "read": ["site/index.html","site/assets/css/style.css"],
    },
    "05": {
        "edit": [
            "site/templates/city-template.html",
            "site/templates/state-template.html",
            "site/templates/county-template.html",
            "site/docs/project-state.md",
        ],
        "read": [
            "site/index.html","site/assets/css/style.css",
            "site/docs/architecture.md","site/docs/internal-linking.md",
        ],
    },
    "06": {"edit": ["site/blog.html","site/docs/project-state.md"], "read": ["site/index.html","site/assets/css/style.css"]},
    "07": {"edit": ["site/templates/article-template.html","site/docs/project-state.md"], "read": ["site/blog.html","site/assets/css/style.css"]},
    "08": {"edit": ["site/faq.html","site/docs/project-state.md"], "read": ["site/index.html","site/assets/css/style.css"]},
    "09": {"edit": ["site/about.html","site/docs/project-state.md"], "read": ["site/index.html","site/assets/css/style.css"]},
    "10": {"edit": ["site/contact.html","site/docs/project-state.md"], "read": ["site/index.html","site/assets/css/style.css"]},
    "11": {
        "edit": ["site/assets/css/style.css","site/docs/project-state.md"],
        "read": ["site/index.html","site/services.html","site/blog.html","site/faq.html","site/about.html","site/contact.html"],
    },
    "12": {"edit": ["site/assets/js/main.js","site/docs/project-state.md"], "read": ["site/index.html","site/assets/css/style.css"]},
    "13": {
        "edit": ["site/sitemap.xml","site/robots.txt","site/docs/seo.md","site/docs/internal-linking.md","site/docs/project-state.md"],
        "read": ["site/services.html","site/index.html"],
    },
    "14": {
        "edit": ["site/templates/city-template.html","site/templates/state-template.html","site/docs/project-state.md"],
        "read": ["site/docs/seo.md","site/docs/architecture.md","site/docs/internal-linking.md","site/index.html"],
    },
}

STATE_LABELS: dict[str, str] = {
    "00": "Global rules defined",
    "01": "Architecture documented",
    "02": "CSS base created",
    "03": "Homepage built",
    "04": "Services page built",
    "05": "Location templates built",
    "06": "Blog page built",
    "07": "Article template built",
    "08": "FAQ page built",
    "09": "About page built",
    "10": "Contact page built",
    "11": "CSS finalized",
    "12": "JavaScript built",
    "13": "SEO files created",
    "14": "Programmatic SEO templates finalized",
}

# ── Git helpers ────────────────────────────────────────────────────────────────
def get_head() -> str:
    return subprocess.check_output(["git", "rev-parse", "HEAD"]).decode().strip()

def repo_has_changes() -> bool:
    if subprocess.run(["git","add","--dry-run","--force","site"], capture_output=True, text=True).stdout.strip():
        return True
    return subprocess.run(["git","diff","--cached","--quiet"], capture_output=True).returncode != 0

def get_completed_prompts() -> set[str]:
    result = subprocess.run(["git","log","--format=%s","--all"], capture_output=True, text=True, check=True)
    completed: set[str] = set()
    for line in result.stdout.splitlines():
        m = re.match(r"AI:\s+(.+?)(?:\s*\[|$)", line)
        if m:
            completed.add(m.group(1).strip())
    return completed

def git_commit(label: str) -> None:
    subprocess.run(["git","add","--force","site"], check=True)
    if subprocess.run(["git","diff","--cached","--quiet"]).returncode == 0:
        log.info("No staged changes for: %s", label)
        return
    changed = subprocess.check_output(["git","diff","--cached","--name-only"]).decode().strip().splitlines()
    summary    = ", ".join(Path(f).name for f in changed[:5])
    commit_msg = f"AI: {label}" + (f" [{summary}]" if summary else "")
    subprocess.run(["git","commit","-m",commit_msg], check=True)
    log.info("Committed: %s", commit_msg)

def update_project_state(prefix: str) -> None:
    label      = STATE_LABELS.get(prefix, prefix)
    state_file = Path("site/docs/project-state.md")
    state_file.parent.mkdir(parents=True, exist_ok=True)
    current    = state_file.read_text(encoding="utf-8") if state_file.exists() else "# Project State\n\n## Completed\n"
    entry      = f"- [x] {label}"
    if entry not in current:
        state_file.write_text(current.rstrip("\n") + "\n" + entry + "\n", encoding="utf-8")

def git_push() -> None:
    log.info("Pushing to GitHub...")
    subprocess.run(["git","push","origin","HEAD:main"], check=True)
    log.info("Push successful.")

# ── Aider output analysis ──────────────────────────────────────────────────────
_RATE_LIMIT_MARKERS = (
    "RateLimitError", "Error code: 429", "Too Many Requests", "'status': 429",
)

# Only consulted when edit files are confirmed empty — prevents summarization
# warnings emitted AFTER a successful write from causing false-positive retries.
_RETRYABLE_MARKERS = (
    "i didn't see any properly formatted edits",
    "no changes were made",
    "didn't make any changes",
    "no edits found",
    "couldn't find any edits",
    "i wasn't able to make the requested changes",
    "litellm.exceptions",
    "bad gateway",
    "summarizer unexpectedly failed",
    "cannot schedule new futures after shutdown",
    "summarization failed",
    "continued below",
    "to be continued",
    "i'll continue",
    "continue in the next",
    "part 1 of",
    "part 2 of",
)

_LOOP_MARKER = "i need to make the following changes"

def is_rate_limited(output: str) -> bool:
    return any(m in output for m in _RATE_LIMIT_MARKERS)

def aider_needs_retry(output: str) -> bool:
    """Only call this when files are already confirmed empty."""
    lower = output.lower()
    return any(m in lower for m in _RETRYABLE_MARKERS)

def aider_is_looping(output: str) -> bool:
    return output.lower().count(_LOOP_MARKER) >= 3

# ── Pipeline helpers ───────────────────────────────────────────────────────────
def check_edit_files_have_content(edit_files: list[str], label: str) -> None:
    invalid = []
    for f in edit_files:
        if f in PIPELINE_MANAGED:
            continue
        p = Path(f)
        if not p.exists():
            invalid.append(f"{f} (missing)")
            continue
        content = p.read_text(encoding="utf-8", errors="ignore")
        if not content.strip():
            invalid.append(f"{f} (empty)")
        elif len(content.strip()) < 50:
            invalid.append(f"{f} (too small: {len(content)} chars)")
    if invalid:
        raise RuntimeError(f"Pipeline halted after '{label}'\n" + "\n".join(invalid))

def validate_edit_files(edit_files: list[str], *, allow_new: bool = False) -> None:
    if allow_new:
        return
    missing = [f for f in edit_files if not Path(f).exists()]
    if missing:
        raise FileNotFoundError(f"Missing edit files: {missing}")

# ── Aider runner ───────────────────────────────────────────────────────────────
def run_prompt(
    prompt_file: Path,
    edit_files: list[str],
    read_files: list[str],
    retries: int = 5,
    allow_new_files: bool = True,
) -> bool:
    validate_edit_files(edit_files, allow_new=allow_new_files)

    raw_prompt = prompt_file.read_text(encoding="utf-8").strip()
    if not raw_prompt:
        raise ValueError(f"Empty prompt: {prompt_file}")

    prompt_text = FORMAT_PREFIX + raw_prompt

    file_args = [arg for f in edit_files for arg in ("--file", f)]
    read_args = [
        arg
        for f in read_files
        if Path(f).exists() and Path(f).stat().st_size > 0
        for arg in ("--read", f)
    ]

    cmd = [
        "aider",
        "--yes",
        "--no-auto-commits",
        "--verbose",
        "--edit-format", "whole",
        "--map-tokens", "0",
        "--max-chat-history-tokens", "2048",
        "--model", MODEL,
        "--model-settings-file", ".aider.model.settings.yml",
        *file_args,
        *read_args,
        "--message", prompt_text,
    ]

    print("\n" + "=" * 60)
    print("PROMPT FILE :", prompt_file.name)
    print("EDIT FILES  :", edit_files)
    print("READ FILES  :", [f for f in read_files if Path(f).exists() and Path(f).stat().st_size > 0])
    print("MODEL       :", MODEL)
    print("─" * 60)
    print("PROMPT TEXT :")
    print(prompt_text)
    print("=" * 60 + "\n")

    for attempt in range(1, retries + 1):
        try:
            log.info("Aider session attempt %d/%d (timeout=%ds)", attempt, retries, AIDER_TIMEOUT_S)
            process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
            )
            full_output: list[str] = []
            if process.stdout:
                for line in process.stdout:
                    sys.stdout.write(line)
                    sys.stdout.flush()
                    full_output.append(line)

            try:
                process.wait(timeout=AIDER_TIMEOUT_S)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
                raise RuntimeError(
                    f"Aider killed after {AIDER_TIMEOUT_S}s — "
                    "likely stuck in a multi-turn loop"
                )

            output = "".join(full_output)
            print("=" * 40)
            log.info("Aider exit code: %d", process.returncode)

            # ── Hard errors regardless of file state ─────────────────────
            if is_rate_limited(output):
                raise RuntimeError("Rate limited by provider (429)")

            if aider_is_looping(output):
                raise RuntimeError("Aider stuck in internal retry loop (3+ attempts).")

            if process.returncode != 0:
                raise RuntimeError(f"Aider exited with code {process.returncode}")

            # ── Check file content FIRST ──────────────────────────────────
            # Measure every non-managed edit file.
            non_managed   = [f for f in edit_files if f not in PIPELINE_MANAGED]
            file_sizes    = {
                f: len(Path(f).read_text(encoding="utf-8", errors="ignore").strip())
                   if Path(f).exists() else -1
                for f in non_managed
            }

            for f, size in file_sizes.items():
                log.info("Post-aider: %s  stripped=%d chars", f, size)
                if size > 0:
                    log.info("Preview: %s", repr(
                        Path(f).read_text(encoding="utf-8", errors="ignore")[:200]
                    ))

            missing_files = [f for f, s in file_sizes.items() if s == -1]
            empty_files   = [f for f, s in file_sizes.items() if s < 50]

            if missing_files:
                raise RuntimeError(f"Files were not created: {missing_files}")

            if empty_files:
                # ── Files are empty — NOW check output markers ────────────
                # Only here is it meaningful to scan for retryable signals.
                # A summarization warning on a successful session never reaches
                # this branch, so it can never cause a false-positive retry.
                if aider_needs_retry(output):
                    raise RuntimeError(
                        f"Files empty {empty_files} and output confirms no edits applied "
                        "(wrong format / API error / summarizer crash). Retrying."
                    )
                raise RuntimeError(
                    f"Aider exited 0 but files are empty: {empty_files}"
                )

            # ── All files have content — session succeeded ────────────────
            # Do NOT call aider_needs_retry() here. Summarization warnings,
            # "cannot schedule new futures", etc. are post-success noise and
            # must not trigger a retry.
            log.info("All edit files have content — session succeeded.")
            time.sleep(60)
            return True

        except Exception as exc:
            log.error("Attempt %d/%d failed: %s: %s", attempt, retries, type(exc).__name__, exc)
            if attempt >= retries:
                raise RuntimeError(f"Failed after {retries} attempts") from exc
            wait = min(MAX_RETRY_DELAY, BASE_RETRY_DELAY * (2 ** min(attempt - 1, 4)))
            log.info("Retrying in %ds…", wait)
            time.sleep(wait)

    return False


# ── Main ───────────────────────────────────────────────────────────────────────
def main() -> None:
    if LOCK_FILE.exists():
        raise RuntimeError("Another run is already active (lock file present).")

    LOCK_FILE.touch()
    try:
        prompts_dir = Path("prompts")
        prompts_dir.mkdir(parents=True, exist_ok=True)

        prompts = sorted(prompts_dir.glob("*.md"))
        if not prompts:
            log.warning("No prompt files found in prompts/")
            return

        completed = get_completed_prompts()
        log.info("Already completed: %s", completed or "none")

        for prompt_file in prompts:
            prefix = prompt_file.stem[:2]
            label  = STATE_LABELS.get(prefix, prefix)

            if label in completed:
                log.info("Skipping %s — already committed.", prompt_file.name)
                continue

            config     = PROMPT_FILES.get(prefix, {"edit": ["site/index.html"], "read": []})
            edit_files = config["edit"]
            read_files = config["read"]

            primary_output = Path(edit_files[0])
            if primary_output.exists() and len(primary_output.read_text(encoding="utf-8").strip()) > 50:
                log.info("Skipping %s — output already has content.", prompt_file.name)
                continue

            log.info("Running  : %s", prompt_file.name)
            log.info("Edit     : %s", edit_files)
            log.info("Read     : %s", read_files)

            for f in edit_files:
                p = Path(f)
                p.parent.mkdir(parents=True, exist_ok=True)
                if not p.exists():
                    p.touch()
                    log.info("Pre-created: %s", f)

            head_before = get_head()
            run_prompt(prompt_file, edit_files, read_files)
            head_after  = get_head()

            if head_before != head_after:
                log.warning("HEAD changed during aider run — check --no-auto-commits.")

            check_edit_files_have_content(edit_files, label)

            log.info("===== GIT STATUS =====")
            subprocess.run(["git","status"])
            subprocess.run(["git","diff","--name-only"], check=False)
            subprocess.run(["git","diff","--cached","--name-only"], check=False)

            if repo_has_changes():
                update_project_state(prefix)
                for f in edit_files:
                    p = Path(f)
                    if not p.exists():
                        raise RuntimeError(f"{f} disappeared before commit")
                    content = p.read_text(encoding="utf-8", errors="ignore")
                    log.info("%s => %d chars", f, len(content))
                    if not content.strip():
                        raise RuntimeError(f"{f} is empty before commit")

                log.info("===== PRE-COMMIT STATUS =====")
                subprocess.run(["git","status"])
                subprocess.run(["git","diff","--cached","--name-only"])

                git_commit(label)

                log.info("===== VERIFYING COMMIT =====")
                subprocess.run(["git","show","--stat","HEAD"])
                log.info("HEAD: %s", subprocess.check_output(["git","rev-parse","HEAD"], text=True).strip())
                git_push()
                log.info("Push completed successfully.")
                time.sleep(POST_COMMIT_SLEEP)
            else:
                raise RuntimeError(
                    f"Pipeline halted after '{label}' — aider ran but made no file changes."
                )

    except KeyboardInterrupt:
        log.warning("Interrupted by user — exiting cleanly.")
        sys.exit(1)
    finally:
        LOCK_FILE.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
