import subprocess
from pathlib import Path

MODEL = "openai/deepseek-ai/deepseek-v4-pro"

for prompt_file in sorted(Path("prompts").glob("*.md")):
    prompt = prompt_file.read_text()

    subprocess.run([
        "aider",
        "--yes",
        "--model",
        MODEL,
        "index.html",
        "--message",
        prompt
    ], check=True)
