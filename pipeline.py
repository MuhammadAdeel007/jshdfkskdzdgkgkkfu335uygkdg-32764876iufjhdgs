import subprocess
import time
from pathlib import Path

MODEL = "openai/deepseek-ai/deepseek-v4-pro"

PROMPT_FILES = {
    "00": {
        "edit": ["site/docs/architecture.md"],
        "read": []
    },
    "01": {
        "edit": ["site/docs/architecture.md"],
        "read": []
    },
    "02": {
        "edit": ["site/assets/css/style.css"],
        "read": ["site/docs/architecture.md"]
    },
    "03": {
        "edit": ["site/index.html"],
        "read": ["site/docs/architecture.md", "site/assets/css/style.css"]
    },
    "04": {
        "edit": ["site/services.html"],
        "read": ["site/index.html", "site/assets/css/style.css"]
    },
    "05": {
        "edit": [
            "site/templates/city-template.html",
            "site/templates/state-template.html",
            "site/templates/county-template.html"
        ],
        "read": ["site/index.html", "site/assets/css/style.css", "site/docs/architecture.md"]
    },
    "06": {
        "edit": ["site/blog.html"],
        "read": ["site/index.html", "site/assets/css/style.css"]
    },
    "07": {
        "edit": ["site/templates/article-template.html"],
        "read": ["site/blog.html", "site/assets/css/style.css"]
    },
    "08": {
        "edit": ["site/faq.html"],
        "read": ["site/index.html", "site/assets/css/style.css"]
    },
    "09": {
        "edit": ["site/about.html"],
        "read": ["site/index.html", "site/assets/css/style.css"]
    },
    "10": {
        "edit": ["site/contact.html"],
        "read": ["site/index.html", "site/assets/css/style.css"]
    },
    "11": {
        "edit": ["site/assets/css/style.css"],
        "read": [
            "site/index.html",
            "site/services.html",
            "site/blog.html",
            "site/faq.html",
            "site/about.html",
            "site/contact.html"
        ]
    },
    "12": {
        "edit": ["site/assets/js/main.js"],
        "read": ["site/index.html", "site/assets/css/style.css"]
    },
    "13": {
        "edit": ["site/sitemap.xml", "site/robots.txt"],
        "read": ["site/docs/seo.md", "site/index.html"]
    },
    "14": {
        "edit": [
            "site/templates/city-template.html",
            "site/templates/state-template.html"
        ],
        "read": ["site/docs/seo.md", "site/docs/architecture.md", "site/index.html"]
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


def run_prompt(prompt_file, edit_files, read_files, retries=3):
    read_args = []
    for f in read_files:
        if Path(f).exists() and Path(f).stat().st_size > 0:
            read_args += ["--read", f]

    for attempt in range(retries):
        try:
            subprocess.run(
                [
                    "aider",
                    "--yes",
                    "--model", MODEL,
                    *edit_files,
                    *read_args,
                    "--message", prompt_file.read_text()
                ],
                check=True
            )
            return True
        except subprocess.CalledProcessError as e:
            wait = 2 ** attempt * 5
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

        success = run_prompt(prompt_file, edit_files, read_files)

        if success:
            git_commit(label)


if __name__ == "__main__":
    main()
