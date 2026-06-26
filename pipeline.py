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
BASE_RETRY_DELAY  = 120    # seconds (doubles each attempt)
MAX_RETRY_DELAY   = 900    # seconds cap
POST_COMMIT_SLEEP = 15     # seconds between prompts after a commit
os.environ["LITELLM_LOG"] = "DEBUG"

# ── Logging ────────────────────────────────────────────────────────────────────
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

# ── Wholefile format instructions prepended to every prompt ───────────────────
# Minimax-m3 tends to add a preamble and decorative borders, both of which
# break aider's wholefile parser.  These instructions appear first in the
# user message so the model sees them before the actual task.
FORMAT_PREFIX = """\
=== MANDATORY OUTPUT FORMAT — FOLLOW EXACTLY ===

Respond using ONLY the wholefile format. No preamble, no explanation,
no decorative borders, no markdown outside of file blocks.

For EACH file, write EXACTLY:

<exact file path — e.g. site/docs/architecture.md>
```
<complete file content>
```

RULES:
- Filename must be on its own line with nothing else on that line
- Do NOT wrap filenames in backticks, bold (**), or any markdown
- Use ONLY ``` fences — never ~~~
- Do NOT use unicode box/table characters: ─ │ ┌ ┐ └ ┘ ├ ┤ ┬ ┴ ┼ etc.
- Do NOT write ANYTHING before the first filename line
- Content inside fences must be the COMPLETE file, not a partial snippet

=== END FORMAT INSTRUCTIONS — TASK BELOW ===

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
        "edit": ["site/templates/city-template.html","site/templates/state-template.html","site/templates/county-template.html","site/docs/project-state.md"],
        "read": ["site/index.html","site/assets/css/style.css","site/docs/architecture.md","site/docs/internal-linking.md"],
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
    add_dry = subprocess.run(["git", "add", "--dry-run", "--force", "site"], capture_output=True, text=True)
    if add_dry.stdout.strip():
        return True
    cached = subprocess.run(["git", "diff", "--cached", "--quiet"], capture_output=True)
    return cached.returncode != 0


def get_completed_prompts() -> set[str]:
    result = subprocess.run(
        ["git", "log", "--format=%s", "--all"],
        capture_output=True, text=True, check=True,
    )
    completed: set[str] = set()
    for line in result.stdout.splitlines():
        match = re.match(r"AI:\s+(.+?)(?:\s*\[|$)", line)
        if match:
            completed.add(match.group(1).strip())
    return completed


def git_commit(label: str) -> None:
    subprocess.run(["git", "add", "--force", "site"], check=True)
    if subprocess.run(["git", "diff", "--cached", "--quiet"]).returncode == 0:
        log.info("No staged changes to commit for: %s", label)
        return
    changed_files = (
        subprocess.check_output(["git", "diff", "--cached", "--name-only"])
        .decode().strip().splitlines()
    )
    summary    = ", ".join(Path(f).name for f in changed_files[:5])
    commit_msg = f"AI: {label}" + (f" [{summary}]" if summary else "")
    subprocess.run(["git", "commit", "-m", commit_msg], check=True)
    log.info("Committed: %s", commit_msg)


def update_project_state(prefix: str) -> None:
    label      = STATE_LABELS.get(prefix, prefix)
    state_file = Path("site/docs/project-state.md")
    state_file.parent.mkdir(parents=True, exist_ok=True)
    current = (
        state_file.read_text(encoding="utf-8") if state_file.exists()
        else "# Project State\n\n## Completed\n"
    )
    entry = f"- [x] {label}"
    if entry not in current:
        state_file.write_text(current.rstrip("\n") + "\n" + entry + "\n", encoding="utf-8")


def git_push() -> None:
    log.info("Pushing to GitHub...")
    subprocess.run(["git", "push", "origin", "HEAD:main"], check=True)
    log.info("Push successful.")


# ── Aider output analysis ──────────────────────────────────────────────────────

_RATE_LIMIT_MARKERS = (
    "RateLimitError", "Error code: 429", "Too Many Requests", "'status': 429",
)

# Aider exits 0 but writes nothing when:
# (a) the model response had no recognisable wholefile blocks
# (b) a network/API error occurred and aider recovered gracefully
# (c) aider's summarizer crashed (threading shutdown race in litellm)
# All of these must be detected and retried.
_RETRYABLE_AIDER_MARKERS = (
    # no-edit markers
    "i didn't see any properly formatted edits",
    "no changes were made",
    "didn't make any changes",
    "no edits found",
    "couldn't find any edits",
    "i wasn't able to make the requested changes",
    # API/network failure markers that aider swallows
    "litellm.exceptions",
    "api error",
    "502",
    "bad gateway",
    # summarizer crash — aider recovers but the generation never completed
    "summarizer unexpectedly failed",
    "cannot schedule new futures after shutdown",
    "summarization failed",
)


def is_rate_limited(output: str) -> bool:
    return any(m in output for m in _RATE_LIMIT_MARKERS)


def aider_needs_retry(output: str) -> bool:
    """Return True when aider exited 0 but clearly didn't write any useful content."""
    lower = output.lower()
    return any(m in lower for m in _RETRYABLE_AIDER_MARKERS)


# ── Pipeline helpers ───────────────────────────────────────────────────────────

def check_edit_files_have_content(edit_files: list[str], label: str) -> None:
    PIPELINE_MANAGED = {"site/docs/project-state.md"}
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
        raise RuntimeError(
            f"Pipeline halted after '{label}'\n" + "\n".join(invalid)
        )


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

    # Prepend format instructions — the model must see these first.
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
            log.info(
                "Starting Aider session (attempt %d/%d)...\n" + "=" * 40,
                attempt, retries,
            )
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
                process.wait(timeout=600)
                for f in edit_files:
                    p = Path(f)
                    if not p.exists():
                        raise RuntimeError(f"{f} was not created")
                    content = p.read_text(encoding="utf-8", errors="ignore")
                    log.info("Post-aider file check: %s (%d bytes, %d chars)", f, p.stat().st_size, len(content))
                    log.info("Preview of %s:\n%s", f, repr(content[:300]))

            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
                raise RuntimeError("Aider timed out after 600s — possible network hang")

            output = "".join(full_output)
            print("=" * 40)

            log.info("Aider exit code: %d", process.returncode)

            if is_rate_limited(output):
                raise RuntimeError("Rate limited by provider (429)")

            # Detect aider's "no edits" and API/summarizer crash scenarios.
            # In all these cases aider exits 0 but writes nothing — we must
            # retry rather than letting check_edit_files_have_content fail later.
            if aider_needs_retry(output):
                raise RuntimeError(
                    "Aider exited 0 but output indicates no edits were applied "
                    "(wrong format, API error, or summarizer crash). Retrying."
                )

            if process.returncode != 0:
                raise RuntimeError(f"Aider exited with code {process.returncode}")

            time.sleep(60)
            return True

        except Exception as exc:
            log.error("Attempt %d/%d failed — %s: %s", attempt, retries, type(exc).__name__, exc)
            if attempt >= retries:
                raise RuntimeError(f"Failed after {retries} attempts") from exc
            wait = min(MAX_RETRY_DELAY, BASE_RETRY_DELAY * (2 ** min(attempt - 1, 5)))
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
                log.info("Skipping %s — output file already has content.", prompt_file.name)
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
            subprocess.run(["git", "status"])
            subprocess.run(["git", "diff", "--name-only"], check=False)
            subprocess.run(["git", "diff", "--cached", "--name-only"], check=False)

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
                subprocess.run(["git", "status"])
                subprocess.run(["git", "diff", "--cached", "--name-only"])

                git_commit(label)

                log.info("===== VERIFYING COMMIT =====")
                subprocess.run(["git", "show", "--stat", "HEAD"])
                log.info("HEAD commit: %s",
                    subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip())
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
