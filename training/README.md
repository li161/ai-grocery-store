# AGENT FOUNDRY — Student SFT

This training entry point performs a real causal-language-model supervised fine-tuning run from successful trajectory samples exported by `/foundry.html`.

## Requirements

- Python 3.10+
- PyTorch-compatible machine (CPU works for smoke-sized experiments; GPU is recommended)
- Hugging Face access to the selected base model

## Run

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r training/requirements.txt
python training/train_sft.py \
  --input ./agent-foundry-sft.jsonl \
  --output ./artifacts/student-v1
```

Optional parameters: `--model`, `--epochs`, `--batch-size`, `--learning-rate`, `--max-length`.

## Scope and limitations

- The current dataset exporter includes successful task-level text results only.
- The trainer performs text-response SFT. It does not yet distill structured function/tool calls, hidden reasoning, or a complete multi-step policy.
- The produced model is saved locally. Online Student inference and deployment into the Harness are not wired in this first vertical slice.
- Keep evaluation data separate from training data. Do not report training-set fit as generalization.
