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

MODEL            = "openai/deepseek-ai/deepseek-v4-pro"
LOCK_FILE        = Path(".aider-run.lock")
BASE_RETRY_DELAY = 120    # seconds (doubles each attempt)
MAX_RETRY_DELAY  = 900   # seconds cap
POST_COMMIT_SLEEP = 15   # seconds between prompts after a commit
os.environ["LITELLM_LOG"] = "DEBUG"

# ── Logging ────────────────────────────────────────────────────────────────────
log.info(
    "Repository root: %s",
    subprocess.check_output(
        ["git", "rev-parse", "--show-toplevel"]
    ).decode().strip()
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

# ── Prompt / file map ──────────────────────────────────────────────────────────

PROMPT_FILES: dict[str, dict[str, list[str]]] = {
    "00": {
        "edit": ["site/docs/global-rules.md","site/docs/project-state.md"],
        "read": [],
    },
    "01": {
        "edit": ["site/docs/architecture.md","site/docs/project-state.md"],
        "read": ["site/docs/global-rules.md"],
    },
    "02": {
        "edit": ["site/assets/css/style.css","site/docs/project-state.md"],
        "read": ["site/docs/architecture.md"],
    },
    "03": {
        "edit": ["site/index.html","site/docs/project-state.md"],
        "read": [
            "site/docs/architecture.md",
            "site/assets/css/style.css",
        ],
    },
    "04": {
        "edit": ["site/services.html","site/docs/project-state.md"],
        "read": [
            "site/index.html",
            "site/assets/css/style.css",
        ],
    },
    "05": {
        "edit": [
            "site/templates/city-template.html",
            "site/templates/state-template.html",
            "site/templates/county-template.html",
            "site/docs/project-state.md"
        ],
        "read": [
            "site/index.html",
            "site/assets/css/style.css",
            "site/docs/architecture.md",
            "site/docs/internal-linking.md",
        ],
    },
    "06": {
        "edit": ["site/blog.html","site/docs/project-state.md"],
        "read": [
            "site/index.html",
            "site/assets/css/style.css",
        ],
    },
    "07": {
        "edit": ["site/templates/article-template.html","site/docs/project-state.md"],
        "read": [
            "site/blog.html",
            "site/assets/css/style.css",
        ],
    },
    "08": {
        "edit": ["site/faq.html","site/docs/project-state.md"],
        "read": [
            "site/index.html",
            "site/assets/css/style.css",
        ],
    },
    "09": {
        "edit": ["site/about.html","site/docs/project-state.md"],
        "read": [
            "site/index.html",
            "site/assets/css/style.css",
        ],
    },
    "10": {
        "edit": ["site/contact.html","site/docs/project-state.md"],
        "read": [
            "site/index.html",
            "site/assets/css/style.css",
        ],
    },
    "11": {
        "edit": ["site/assets/css/style.css","site/docs/project-state.md"],
        "read": [
            "site/index.html",
            "site/services.html",
            "site/blog.html",
            "site/faq.html",
            "site/about.html",
            "site/contact.html",
        ],
    },
    "12": {
        "edit": ["site/assets/js/main.js","site/docs/project-state.md"],
        "read": [
            "site/index.html",
            "site/assets/css/style.css",
        ],
    },
    "13": {
        "edit": [
            "site/sitemap.xml",
            "site/robots.txt",
            "site/docs/seo.md",
            "site/docs/internal-linking.md",
            "site/docs/project-state.md"
        ],
        "read": [
            "site/services.html",
            "site/index.html",
        ],
    },
    "14": {
        "edit": [
            "site/templates/city-template.html",
            "site/templates/state-template.html",
            "site/docs/project-state.md"
        ],
        "read": [
            "site/docs/seo.md",
            "site/docs/architecture.md",
            "site/docs/internal-linking.md",
            "site/index.html",
        ],
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
    result = subprocess.run(["git", "status", "--porcelain", "site"],capture_output=True,text=True)
    return bool(result.stdout.strip())


def get_completed_prompts() -> set[str]:
    """Return the set of full labels already present in git history."""
    result = subprocess.run(
        ["git", "log", "--format=%s"],
        capture_output=True,
        text=True,
        check=True,
    )
    completed: set[str] = set()
    for line in result.stdout.splitlines():
        match = re.match(r"AI:\s+(.+?)(?:\s+\[|$)", line)
        if match:
            completed.add(match.group(1).strip())
    return completed

def git_commit(label: str) -> None:
    subprocess.run(["git", "add", "site"], check=True)

    if subprocess.run(["git", "diff", "--cached", "--quiet"]).returncode == 0:
        log.info("No staged changes to commit for: %s", label)
        return

    changed_files = (
        subprocess.check_output(["git", "diff", "--cached", "--name-only"])
        .decode()
        .strip()
        .splitlines()
    )
    summary   = ", ".join(Path(f).name for f in changed_files[:5])
    commit_msg = f"AI: {label}" + (f" [{summary}]" if summary else "")

    subprocess.run(["git", "commit", "-m", commit_msg], check=True)
    log.info("Committed: %s", commit_msg)


def update_project_state(prefix: str) -> None:
    label      = STATE_LABELS.get(prefix, prefix)
    state_file = Path("site/docs/project-state.md")
    state_file.parent.mkdir(parents=True, exist_ok=True)
  
    current = (
        state_file.read_text(encoding="utf-8")
        if state_file.exists()
        else "# Project State\n\n## Completed\n"
    )

    entry = f"- [x] {label}"
    if entry not in current:
        state_file.write_text(
            current.rstrip("\n") + "\n" + entry + "\n",
            encoding="utf-8",
        )

# ── Aider helpers ──────────────────────────────────────────────────────────────

_RATE_LIMIT_MARKERS = (
    "RateLimitError",
    "Error code: 429",
    "Too Many Requests",
    "'status': 429",
)


def is_rate_limited(output: str) -> bool:
    return any(marker in output for marker in _RATE_LIMIT_MARKERS)


def check_edit_files_have_content(edit_files: list[str], label: str) -> None:
    invalid = []

    for f in edit_files:
        p = Path(f)

        if not p.exists():
            invalid.append(f"{f} (missing)")
            continue

        content = p.read_text(encoding="utf-8", errors="ignore")

        if not content.strip():
            invalid.append(f"{f} (empty)")
            continue

        if len(content.strip()) < 50:
            invalid.append(f"{f} (too small: {len(content)} chars)")

    if invalid:
        raise RuntimeError(
            f"Pipeline halted after '{label}'\n"
            + "\n".join(invalid)
        )

def validate_edit_files(
    edit_files: list[str],
    *,
    allow_new: bool = False,
) -> None:
    """Raise FileNotFoundError for any missing edit-files unless allow_new=True."""
    if allow_new:
        return
    missing = [f for f in edit_files if not Path(f).exists()]
    if missing:
        raise FileNotFoundError(f"Missing edit files: {missing}")


def run_prompt(
    prompt_file: Path,
    edit_files: list[str],
    read_files: list[str],
    retries: int = 5,
    allow_new_files: bool = True,
) -> bool:
    """Run aider for one prompt file, retrying on transient errors."""
    validate_edit_files(edit_files, allow_new=allow_new_files)

    prompt_text = prompt_file.read_text(encoding="utf-8").strip()
    if not prompt_text:
        raise ValueError(f"Empty prompt: {prompt_file}")

    file_args: list[str] = []
    for f in edit_files:
        file_args += ["--file", f]
     
    read_args: list[str] = []
    for f in read_files:
        path = Path(f)
        if path.exists() and path.stat().st_size > 0:
            read_args += ["--read", f]

    cmd = [
        "aider",
        "--yes",
        # "--no-stream",
        "--no-auto-commits",
        "--verbose",
        "--model",
        MODEL,
        *file_args,
        *read_args,
        "--message", 
        prompt_text,   # reuse already-read text; no second disk read
    ]

    # ── Debug: print everything being sent to the model ──────────────────────
    print("\n" + "=" * 60)
    print("PROMPT FILE :", prompt_file.name)
    print("EDIT FILES  :", edit_files)
    print("READ FILES  :", [f for f in read_files if Path(f).exists() and Path(f).stat().st_size > 0])
    print("MODEL       :", MODEL)
    print("─" * 60)
    print("PROMPT TEXT :")
    print(prompt_text)
    print("=" * 60 + "\n")
    # ─────────────────────────────────────────────────────────────────────────

    for attempt in range(1, retries + 1):
        try:
            log.info("Starting Aider session. Streaming output below...\n" + "="*40)
            process = subprocess.Popen(cmd, 
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT, # Merge errors into standard output
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

                    content = p.read_text(encoding="utf-8",errors="ignore")
                    log.info("Post-aider file check: %s (%d bytes, %d chars)",f,p.stat().st_size,len(content))
                    log.info("Preview of %s:\n%s",f,repr(content[:300]))                  

                    size = p.stat().st_size
                    log.info("Post-aider file check: %s (%d bytes)",f,size)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()          # reap the zombie
                raise RuntimeError(
                    f"Aider timed out after 600s — "
                    "possible network hang or interactive prompt"
                )

            output = "".join(full_output)
            print("="*40) # Visually close the Aider session output

            if is_rate_limited(output):
                raise RuntimeError("Rate limited by provider (429)")

            if process.returncode != 0:
                raise RuntimeError(f"Aider exited with code {process.returncode}")

            time.sleep(600)
          
            return True

        except Exception as exc:
            log.error(
                "Attempt %d/%d failed — %s: %s",
                attempt, retries, type(exc).__name__, exc,
            )
            if attempt >= retries:
                raise RuntimeError(f"Failed after {retries} attempts") from exc

            wait = min(MAX_RETRY_DELAY, BASE_RETRY_DELAY * (2 ** min(attempt - 1, 5)))
            log.info("Retrying in %ds…", wait)
            time.sleep(wait)

    return False  # unreachable, satisfies type-checkers

# ── Main ───────────────────────────────────────────────────────────────────────

def main() -> None:
    if LOCK_FILE.exists():
        raise RuntimeError("Another run is already active (lock file present).")

    LOCK_FILE.touch()
    try:
        prompts_dir = Path("prompts")
        if not prompts_dir.exists():
            prompts_dir.mkdir(parents=True, exist_ok=True)
        
        prompts = sorted(Path("prompts").glob("*.md"))
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

            config = PROMPT_FILES.get(
                prefix,
                {"edit": ["site/index.html"], "read": []},
            )
            edit_files = config["edit"]
            read_files = config["read"]

            log.info("Running  : %s", prompt_file.name)
            log.info("Edit     : %s", edit_files)
            log.info("Read     : %s", read_files)
            for f in edit_files:
                p = Path(f)
                p.parent.mkdir(parents=True, exist_ok=True)
                if not p.exists():
                    p.touch()
                    log.info("Pre-created missing edit target: %s", f)
 
            head_before = get_head()
            run_prompt(prompt_file, edit_files, read_files)
            head_after  = get_head()

            if head_before != head_after:
                log.warning(
                    "HEAD changed during aider run — aider may be auto-committing "
                    "despite --no-auto-commits."
                )


            check_edit_files_have_content(edit_files, label)

            log.info("===== GIT STATUS =====")
            subprocess.run(["git", "status"])
            subprocess.run(["git", "diff", "--name-only"],check=False)
            subprocess.run(["git", "diff", "--cached", "--name-only"],check=False)

            if repo_has_changes():
                update_project_state(prefix)
                for f in edit_files:
                      p = Path(f)
                      content = p.read_text(encoding="utf-8",errors="ignore")
              
                      log.info("%s => %d chars",f,len(content))
                      if not content.strip():
                          raise RuntimeError(f"{f} is empty before commit")
                git_commit(label)
                time.sleep(POST_COMMIT_SLEEP)
            else:
                raise RuntimeError(
                    f"Pipeline halted after '{label}' — aider ran successfully "
                    "but made no file changes. Check the prompt or model output "
                    "above. Iteration will not advance."
                )

    except KeyboardInterrupt:
        log.warning("Interrupted by user — exiting cleanly.")
        sys.exit(1)
    finally:
        LOCK_FILE.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
