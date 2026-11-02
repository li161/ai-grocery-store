#!/usr/bin/env python3
"""Minimal causal-LM SFT trainer for AGENT FOUNDRY trajectory exports.

Input JSONL rows must contain a non-empty "text" field. This is text-response
behavior SFT; it does not train a structured tool-call policy.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from datasets import Dataset
from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
    DataCollatorForLanguageModeling,
    Trainer,
    TrainingArguments,
)


def load_rows(path: Path) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    with path.open("r", encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            if not line.strip():
                continue
            try:
                item = json.loads(line)
            except json.JSONDecodeError as exc:
                raise ValueError(f"Invalid JSON at line {line_number}: {exc}") from exc
            text = str(item.get("text", "")).strip()
            if text:
                rows.append({"text": text})
    if not rows:
        raise ValueError("Dataset is empty: expected JSONL rows with a non-empty 'text' field.")
    return rows


def main() -> None:
    parser = argparse.ArgumentParser(description="Fine-tune a Student model on Agent Foundry SFT data.")
    parser.add_argument("--input", required=True, type=Path, help="Trajectory JSONL exported from the Foundry UI.")
    parser.add_argument("--output", required=True, type=Path, help="Directory for the trained Student model.")
    parser.add_argument("--model", default="Qwen/Qwen2.5-0.5B-Instruct")
    parser.add_argument("--epochs", type=float, default=2.0)
    parser.add_argument("--batch-size", type=int, default=1)
    parser.add_argument("--learning-rate", type=float, default=2e-5)
    parser.add_argument("--max-length", type=int, default=1024)
    args = parser.parse_args()

    rows = load_rows(args.input)
    tokenizer = AutoTokenizer.from_pretrained(args.model, trust_remote_code=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    dataset = Dataset.from_list(rows)

    def tokenize(batch: dict[str, list[str]]) -> dict:
        encoded = tokenizer(
            batch["text"],
            truncation=True,
            max_length=args.max_length,
            padding="max_length",
        )
        encoded["labels"] = [ids.copy() for ids in encoded["input_ids"]]
        encoded["labels"] = [
            [token if mask else -100 for token, mask in zip(label, attention)]
            for label, attention in zip(encoded["labels"], encoded["attention_mask"])
        ]
        return encoded

    tokenized = dataset.map(tokenize, batched=True, remove_columns=["text"])
    model = AutoModelForCausalLM.from_pretrained(args.model, trust_remote_code=True)
    model.config.use_cache = False
    training = TrainingArguments(
        output_dir=str(args.output),
        num_train_epochs=args.epochs,
        per_device_train_batch_size=args.batch_size,
        learning_rate=args.learning_rate,
        logging_steps=5,
        save_strategy="epoch",
        report_to="none",
        remove_unused_columns=False,
    )
    trainer = Trainer(
        model=model,
        args=training,
        train_dataset=tokenized,
        data_collator=DataCollatorForLanguageModeling(tokenizer=tokenizer, mlm=False),
    )
    trainer.train()
    trainer.save_model(str(args.output))
    tokenizer.save_pretrained(str(args.output))
    print(f"Student model saved to {args.output} using {len(rows)} trajectory samples.")


if __name__ == "__main__":
    main()
