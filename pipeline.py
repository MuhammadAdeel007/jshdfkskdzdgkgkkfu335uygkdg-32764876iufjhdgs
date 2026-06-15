import subprocess
from pathlib import Path

MODEL = "openai/deepseek-ai/deepseek-v4-pro"

prompts = sorted(
    Path("prompts").glob("*.md")
)

for prompt_file in prompts:

    prompt = prompt_file.read_text()

    subprocess.run(
        [
            "aider",
            "--yes",
            "--model",
            MODEL,
            "src",
            "--message",
            prompt,
        ],
        check=True
    )
