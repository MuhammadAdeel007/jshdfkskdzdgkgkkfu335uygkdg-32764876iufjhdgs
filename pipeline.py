import re
import subprocess
import time
from pathlib import Path

MODEL = "openai/deepseek-ai/deepseek-v4-pro"

LOCK_FILE = Path(".aider-run.lock")

PROMPT_FILES = {
    "00": {
        "edit": ["site/docs/architecture.md"],
        "read": ["site/docs/project-state.md"]
    },
    "01": {
        "edit": ["site/docs/architecture.md"],
        "read": ["site/docs/project-state.md"]
    },
    "02": {
        "edit": ["site/assets/css/style.css"],
        "read": ["site/docs/architecture.md", "site/docs/project-state.md"]
    },
    "03": {
        "edit": ["site/index.html"],
        "read": [
            "site/docs/architecture.md",
            "site/assets/css/style.css",
            "site/docs/project-state.md"
        ]
    },
    "04": {
        "edit": ["site/services.html"],
        "read": [
            "site/index.html",
            "site/assets/css/style.css",
            "site/docs/project-state.md"
        ]
    },
    "05": {
        "edit": [
            "site/templates/city-template.html",
            "site/templates/state-template.html",
            "site/templates/county-template.html"
        ],
        "read": [
            "site/index.html",
            "site/assets/css/style.css",
            "site/docs/architecture.md",
            "site/docs/internal-linking.md",
            "site/docs/project-state.md"
        ]
    },
    "06": {
        "edit": ["site/blog.html"],
        "read": [
            "site/index.html",
            "site/assets/css/style.css",
            "site/docs/project-state.md"
        ]
    },
    "07": {
        "edit": ["site/templates/article-template.html"],
        "read": [
            "site/blog.html",
            "site/assets/css/style.css",
            "site/docs/project-state.md"
        ]
    },
    "08": {
        "edit": ["site/faq.html"],
        "read": [
            "site/index.html",
            "site/assets/css/style.css",
            "site/docs/project-state.md"
        ]
    },
    "09": {
        "edit": ["site/about.html"],
        "read": [
            "site/index.html",
            "site/assets/css/style.css",
            "site/docs/project-state.md"
        ]
    },
    "10": {
        "edit": ["site/contact.html"],
        "read": [
            "site/index.html",
            "site/assets/css/style.css",
            "site/docs/project-state.md"
        ]
    },
    "11": {
        "edit": ["site/assets/css/style.css"],
        "read": [
            "site/index.html",
            "site/services.html",
            "site/blog.html",
            "site/faq.html",
            "site/about.html",
            "site/contact.html",
            "site/docs/project-state.md"
        ]
    },
    "12": {
        "edit": ["site/assets/js/main.js"],
        "read": [
            "site/index.html",
            "site/assets/css/style.css",
            "site/docs/project-state.md"
        ]
    },
    "13": {
        "edit": [
            "site/sitemap.xml",
            "site/robots.txt",
            "site/docs/seo.md",
            "site/docs/internal-linking.md"
        ],
        "read": [
            "site/services.html",
            "site/index.html",
            "site/docs/project-state.md"
        ]
    },
    "14": {
        "edit": [
            "site/templates/city-template.html",
            "site/templates/state-template.html"
        ],
        "read": [
            "site/docs/seo.md",
            "site/docs/architecture.md",
            "site/docs/internal-linking.md",
            "site/index.html",
            "site/docs/project-state.md"
        ]
    },
}

STATE_LABELS = {
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


def get_head(): 
    return ( 
        subprocess.check_output( 
            ["git", "rev-parse", "HEAD"] 
        ) 
        .decode() 
        .strip() 
    ) 

def repo_has_changes(): 
    result = subprocess.run(
        ["git", "diff", "--quiet", "--", "site"]
    )
    return result.returncode != 0

    
def get_completed_prompts(): 
    result = subprocess.run(
        ["git", "log", "--format=%s"],
        capture_output=True,
        text=True,
        check=True 
    ) 
    completed = set()
    for line in result.stdout.splitlines(): 
        match = re.match(r"AI:\s+([^\s\[]+)", line)
        if match:
            completed.add(match.group(1))
            
        return completed

def git_commit(label):
    subprocess.run(
        ["git", "add", "site"],
        check=True
    )

    result = subprocess.run(
        ["git", "diff", "--cached", "--quiet"]
    )

    if result.returncode == 0:
        print(f"No changes to commit for: {label}")
        return

    changed_files = (
        subprocess.check_output(
            ["git", "diff", "--cached", "--name-only"]
        )
        .decode()
        .strip()
        .splitlines()
    )

    summary = ", ".join(
        Path(f).name 
        for f in changed_files[:5]
    )

    commit_msg = f"AI: {label}"

    if summary:
        commit_msg += f" [{summary}]"

    subprocess.run(
        ["git", "commit", "-m", commit_msg],
        check=True
    )

    print(f"Committed: {commit_msg}")


def update_project_state(prefix):
    label = STATE_LABELS.get(prefix, prefix)

    state_file = Path("site/docs/project-state.md")

    if state_file.exists():
        current = state_file.read_text()
    else:
        current = (
            "# Project State\n\n"
            "## Completed\n"
        )
        
    entry = f"- [x] {label}"

    if entry not in current:
        if not current.endswith("\n"):
            current += "\n"

        current += entry + "\n"
        state_file.write_text(
            current,
            encoding="utf-8"
        )


def is_rate_limited(output):
    markers = [
        "RateLimitError",
        "Error code: 429",
        "Too Many Requests",
        "'status': 429",
    ]

    return any(
        marker in output
        for marker in markers
    )

def validate_edit_files(edit_files):
    missing = [ 
        f for f in edit_files 
        if not Path(f).exists()
    ] 
    
    if missing: 
        raise FileNotFoundError( 
            f"Missing edit files: {missing}" 
        )

def run_prompt(prompt_file, edit_files, read_files, retries=5):
    validate_edit_files(edit_files) 
    prompt_text = prompt_file.read_text(
        encoding="utf-8"
    ).strip() 
    
    if not prompt_text: 
        raise ValueError( 
            f"Empty prompt: {prompt_file}" 
        )
        
    read_args = []

    for f in read_files:
        path = Path(f)

        if path.exists() and path.stat().st_size > 0:
            read_args += ["--read", f]

    attempt = 0

    while attempt < retries:
        try:
            result = subprocess.run(
                [
                    "aider",
                    "--yes",
                    "--no-stream",
                    "--no-auto-commits",
                    "--model",
                    MODEL,
                    *edit_files,
                    *read_args,
                    "--message",
                    prompt_file.read_text(),
                ],
                capture_output=True,
                text=True,
            )

            stdout = result.stdout or ""
            stderr = result.stderr or ""
            output = stdout + stderr

            print("\n===== AIDER STDOUT =====")
            print(stdout)

            print("\n===== AIDER STDERR =====")
            print(stderr)

            if is_rate_limited(output):
                raise RuntimeError(
                    "Rate limited by provider (429)"
                )

            if result.returncode != 0:
                raise RuntimeError(
                    f"Aider exited with code "
                    f"{result.returncode}"
                )

            return True

        except Exception as e:
            print(
                f"\nERROR: "
                f"{type(e).__name__}"
            )
            
            print(str(e))
            
            attempt += 1

            if attempt >= retries:
                raise RuntimeError( f"Failed after {retries} attempts" ) from e

            wait = min(600,30 * (2 ** min(attempt - 1, 5)))
            stdout = getattr(e, "stdout", None)

            print(
                f"STDOUT: "
                f"{stdout[-2000:] if stdout else 'none'}"
            )

            print(
                f"\nAttempt {attempt} FAILED for {prompt_file.name}"
            )

            print(
                f"Retrying in {wait}s..."
            )

            time.sleep(wait)

    return False

def main():
    if LOCK_FILE.exists(): 
        raise RuntimeError( "Another run is active." )
    LOCK_FILE.touch()
    
    
    try:
        prompts = sorted(
            Path("prompts").glob("*.md")
        )

        completed = get_completed_prompts()

        prefix = prompt_file.stem[:2]
        label = STATE_LABELS.get(prefix, prefix)
    
        for prompt_file in prompts:
            if label in completed:
                print(
                    f"Skipping {prompt_file.name} "
                    f"(already committed)"
                )
                continue

            prefix = label[:2]

            config = PROMPT_FILES.get(
                prefix,
                {
                    "edit": ["site/index.html"],
                    "read": []
                }
            )

        edit_files = config["edit"]
        read_files = config["read"]

        print(f"\nRunning {prompt_file.name}")
        print(f"Edit : {edit_files}")
        print(f"Read : {read_files}")

        head_before = get_head()
        run_prompt(prompt_file, edit_files, read_files)
        head_after = get_head()

        print( "\n===== GIT STAT =====" )
        subprocess.run( ["git", "status"] )

        print( "\n===== GIT DIFF " "STAT =====" )
        subprocess.run( ["git", "diff", "--stat"] )

        print("\n===== HEAD CHECK =====")
        print("Before:", head_before)
        print("After :", head_after)

        if head_before != head_after:
            print(
                "WARNING: HEAD changed during "
                "aider run. Aider may still be "
                "auto-committing."
            )

        if repo_has_changes():
            update_project_state(prefix)
            git_commit(label)
            time.sleep(15)
        else:
            print(
                f"No file changes detected "
                f"for {prompt_file.name}"
            )
    finally:
        LOCK_FILE.unlink( missing_ok=True )

if __name__ == "__main__":
    main()
