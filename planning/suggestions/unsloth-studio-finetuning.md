# Suggestion: Unsloth Studio Fine-Tuning Loop

**Source**: user conversation, 2026-03-17
**Reference**: https://unsloth.ai/docs/new/studio

## Description

Close the training data loop by using Unsloth Studio to fine-tune an open-source model on Loop Commons' exported training data. This is the project's endgame — the pipeline generates labeled data that doesn't exist in the open-source ecosystem, and Unsloth Studio provides a no-code path from JSONL export to runnable GGUF model.

## Why Unsloth Studio

- **Format compatibility**: Accepts JSON natively. Pipeline already exports versioned JSONL with SHA256 checksums.
- **Data Recipes**: NVIDIA DataDesigner-powered feature transforms raw documents into training-ready datasets. Could convert session JSONL → fine-tuning format without custom preprocessing.
- **Resource efficiency**: 2x faster training, 70% less VRAM — makes fine-tuning accessible on consumer GPUs.
- **Export targets**: GGUF, safetensors, compatible with Ollama/vLLM/llama.cpp — fine-tuned model can run locally or be swapped in as a subagent.
- **Open source**: Apache 2.0 (core), AGPL-3.0 (Studio UI). No vendor lock-in.
- **Observability**: Real-time training loss, gradient norms, GPU utilization — fits the project's "everything visualized" principle.
- **Model Arena**: Side-by-side comparison of models — could compare fine-tuned vs base on red-team battery.

## Integration Path

1. **Export** — Pipeline already produces `training_security_reasoning.jsonl`, `training_rewrite_pairs.jsonl`, `training_threat_calibration.jsonl` with PII scrubbed.
2. **Transform** — Use Unsloth Data Recipes to convert exported JSONL into chat fine-tuning format (or write a lightweight adapter in the pipeline).
3. **Fine-tune** — Train a small open model (e.g. Llama 3, Qwen, Gemma) on amygdala security reasoning data via Unsloth Studio.
4. **Export model** — GGUF for local inference via Ollama.
5. **Evaluate** — Run the existing red-team test battery (`red-team-amygdala.test.ts`, `red-team-routing.test.ts`, `red-team-baseline.test.ts`) against the fine-tuned model. Compare P/R/F1 with Haiku 4.5 baseline using ComparisonMode.
6. **Iterate** — Auto-calibration loop (see `planning/suggestions/auto-calibration-loop.md`) could drive prompt improvements that generate better training data for the next fine-tuning round.

## Prerequisites

- Sufficient training data volume (current: ~40 sessions, need to assess minimum viable dataset size)
- Research: which base model is best suited for security reasoning fine-tuning
- Research: optimal chat fine-tuning format for the three training data types
- GPU access for training (Unsloth offers free Colab T4 notebook as starting point)

## Relationship to Other Work

- Depends on: data pipeline (done), training data export (done)
- Complements: auto-calibration loop suggestion (fine-tuned model feeds back into calibration)
- Validates: the entire project thesis — session data → training data → better open-source model
