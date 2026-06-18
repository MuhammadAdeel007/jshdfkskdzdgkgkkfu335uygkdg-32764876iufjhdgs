import subprocess
import time
from pathlib import Path

MODEL = "openai/deepseek-ai/deepseek-v4-pro"

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
        "read": ["site/docs/architecture.md","site/docs/project-state.md"]
    },
    "03": {
        "edit": ["site/index.html"],
        "read": ["site/docs/architecture.md", "site/assets/css/style.css","site/docs/project-state.md"]
    },
    "04": {
        "edit": ["site/services.html"],
        "read": ["site/index.html", "site/assets/css/style.css","site/docs/project-state.md"]
    },
    "05": {
        "edit": [
            "site/templates/city-template.html",
            "site/templates/state-template.html",
            "site/templates/county-template.html"
        ],
        "read": ["site/index.html", "site/assets/css/style.css", "site/docs/architecture.md", "site/docs/internal-linking.md","site/docs/project-state.md"]
    },
    "06": {
        "edit": ["site/blog.html"],
        "read": ["site/index.html", "site/assets/css/style.css","site/docs/project-state.md"]
    },
    "07": {
        "edit": ["site/templates/article-template.html"],
        "read": ["site/blog.html", "site/assets/css/style.css","site/docs/project-state.md"]
    },
    "08": {
        "edit": ["site/faq.html"],
        "read": ["site/index.html", "site/assets/css/style.css","site/docs/project-state.md"]
    },
    "09": {
        "edit": ["site/about.html"],
        "read": ["site/index.html", "site/assets/css/style.css","site/docs/project-state.md"]
    },
    "10": {
        "edit": ["site/contact.html"],
        "read": ["site/index.html", "site/assets/css/style.css","site/docs/project-state.md"]
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
        "read": ["site/index.html", "site/assets/css/style.css","site/docs/project-state.md"]
    },
    "13": {
        "edit": ["site/sitemap.xml", "site/robots.txt", "site/docs/seo.md", "site/docs/internal-linking.md"],
        "read": ["site/services.html", "site/index.html","site/docs/project-state.md"]
    },
    "14": {
        "edit": [
            "site/templates/city-template.html",
            "site/templates/state-template.html"
        ],
        "read": ["site/docs/seo.md", "site/docs/architecture.md", "site/docs/internal-linking.md", "site/index.html","site/docs/project-state.md"]
    },
}


def get_completed_prompts():
    result = subprocess.run(
        ["git", "log", "--oneline"],
        capture_output=True, text=True
    )
    return result.stdout


def git_commit(label):
    subprocess.run(["git", "add", "."], check=True)
    result = subprocess.run(["git", "diff", "--cached", "--quiet"])
    if result.returncode != 0:
        subprocess.run(
            ["git", "commit", "-m", f"AI: {label}"],
            check=True
        )
        print(f"  Committed: {label}")
    else:
        print(f"  No changes to commit for: {label}")

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

def update_project_state(prefix):
    label = STATE_LABELS.get(prefix, prefix)
    state_file = Path("site/docs/project-state.md")
    current = state_file.read_text() if state_file.exists() else "# Project State\n\n## Completed\n"
    current += f"- ✓ {label}\n"
    state_file.write_text(current)

def run_prompt(prompt_file, edit_files, read_files, retries=5):
    read_args = []
    for f in read_files:
        if Path(f).exists() and Path(f).stat().st_size > 0:
            read_args += ["--read", f]

    for attempt in range(retries):
        try:
            result = subprocess.run(
                [
                    "aider",
                    "--yes",
                    "--no-stream", 
                     "--no-auto-commits",
                    "--model", MODEL,
                    *edit_files,
                    *read_args,
                    "--message", 
                    prompt_file.read_text()
                ],
                check=True,
                capture_output=True,
                text=True
            )
            print("\n===== AIDER STDOUT =====")
            print(result.stdout)

            print("\n===== AIDER STDERR =====")
            print(result.stderr)
            
            if result.returncode == 0:
                return True
        except subprocess.CalledProcessError as e:
            print(f"  STDERR: {e.stderr[-2000:] if e.stderr else 'none'}")
            print(f"  STDOUT: {e.stdout[-2000:] if e.stdout else 'none'}")
            wait = 2 ** attempt * 30
            print(f"\n  Attempt {attempt + 1} FAILED for {prompt_file.name}")
            print(f"  Attempt {attempt + 1} failed. Retrying in {wait}s... ({e})")
            time.sleep(wait)

    print(f"  SKIPPED after {retries} failures: {prompt_file.name}")
    return False


def main():
    prompts = sorted(Path("prompts").glob("*.md"))
    completed = get_completed_prompts()

    for prompt_file in prompts:
        label = prompt_file.stem

        if f"AI: {label}" in completed:
            print(f"Skipping {prompt_file.name} (already committed)")
            continue

        prefix = label[:2]
        config = PROMPT_FILES.get(prefix, {"edit": ["site/index.html"], "read": []})
        edit_files = config["edit"]
        read_files = config["read"]

        print(f"\nRunning {prompt_file.name}")
        print(f"  Edit : {edit_files}")
        print(f"  Read : {read_files}")
        
        status_before = subprocess.check_output(
            ["git", "status", "--porcelain"]
        ).decode()

        head_before = subprocess.check_output(
            ["git", "rev-parse", "HEAD"]
        ).decode().strip()
        
        try:
            success = run_prompt(prompt_file, edit_files, read_files)
        except Exception as e:
            print(f"  ERROR in {prompt_file.name}: {e}")
            continue

        status_after = subprocess.check_output(
            ["git", "status", "--porcelain"]
        ).decode()

        head_after = subprocess.check_output(
            ["git", "rev-parse", "HEAD"]
        ).decode().strip()

        # NEW: useful debugging output
        print("\n===== GIT STATUS AFTER PROMPT =====")
        subprocess.run(["git", "status"])
        
        print("\n===== GIT DIFF STAT =====")
        subprocess.run(["git", "diff", "--stat"])
        
        print("\n===== HEAD CHECK =====")
        print("Before:", head_before)
        print("After :", head_after)

        files_changed = status_before != status_after
        head_changed = head_before != head_after
        
        if success:
            if head_changed:
                print(
                    "WARNING: HEAD changed during aider run. "
                    "Aider may still be auto-committing."
                )
            if files_changed:
                update_project_state(prefix)
                git_commit(label)
                time.sleep(15)
            else:
                print(
                    f"No file changes detected for {prompt_file.name}"
                )

if __name__ == "__main__":
    main()
