#!/usr/bin/env python3
"""
Prepare compact persona JSON for Ask India from NVIDIA Nemotron-Personas-India parquet files.

Usage:
  python3 scripts/prepare_personas_india.py
  python3 scripts/prepare_personas_india.py --sample-size 5000 --seed 42
  python3 scripts/prepare_personas_india.py --input /path/to/train.parquet

Requirements:
  pip install polars huggingface_hub
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Iterable

import polars as pl

# Default: stream the en_IN split from Hugging Face
# The en_IN split has 11 parquet shards (00000-of-00010 … 00010-of-00010)
# We only load the first 3 to keep things fast (covers ~300k rows → more than enough for a 5k sample)
DEFAULT_INPUTS = [
    "https://huggingface.co/datasets/nvidia/Nemotron-Personas-India/resolve/main/data/en_IN-00000-of-00011.parquet",
    "https://huggingface.co/datasets/nvidia/Nemotron-Personas-India/resolve/main/data/en_IN-00001-of-00011.parquet",
    "https://huggingface.co/datasets/nvidia/Nemotron-Personas-India/resolve/main/data/en_IN-00002-of-00011.parquet",
]

# Fields we need from the dataset
REQUIRED_COLUMNS = [
    "uuid",
    "age",
    "sex",
    "occupation",
    "education_level",
    "marital_status",
    "state",
    "district",
    "persona_professional",       # primary persona used for LLM prompts
    "cultural_background",
    "skills_and_expertise",
    "hobbies_and_interests",
    "career_goals_and_ambitions",
]

# Canonical 36 Indian states & UTs (normalized uppercase)
INDIA_STATES = {
    "ANDHRA PRADESH", "ARUNACHAL PRADESH", "ASSAM", "BIHAR", "CHHATTISGARH",
    "GOA", "GUJARAT", "HARYANA", "HIMACHAL PRADESH", "JHARKHAND", "KARNATAKA",
    "KERALA", "MADHYA PRADESH", "MAHARASHTRA", "MANIPUR", "MEGHALAYA",
    "MIZORAM", "NAGALAND", "ODISHA", "PUNJAB", "RAJASTHAN", "SIKKIM",
    "TAMIL NADU", "TELANGANA", "TRIPURA", "UTTAR PRADESH", "UTTARAKHAND",
    "WEST BENGAL",
    # Union Territories
    "ANDAMAN AND NICOBAR ISLANDS", "CHANDIGARH",
    "DADRA AND NAGAR HAVELI AND DAMAN AND DIU", "DELHI",
    "JAMMU AND KASHMIR", "LADAKH", "LAKSHADWEEP", "PUDUCHERRY",
}


def normalize_state(value: str) -> str:
    return " ".join(value.strip().upper().split())


def compact_text(value: str, max_len: int) -> str:
    compact = " ".join(value.strip().split())
    if len(compact) <= max_len:
        return compact
    return compact[: max_len - 3].rstrip() + "..."


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Prepare persona data for Ask India.")
    parser.add_argument(
        "--input",
        nargs="+",
        default=DEFAULT_INPUTS,
        help="One or more parquet paths or HuggingFace hf:// URLs.",
    )
    parser.add_argument(
        "--output",
        default="public/data/personas.compact.india.json",
        help="Output JSON file path.",
    )
    parser.add_argument(
        "--meta-output",
        default="public/data/personas.compact.india.meta.json",
        help="Output metadata JSON file path.",
    )
    parser.add_argument(
        "--sample-size",
        type=int,
        default=5000,
        help="Total personas to keep. Stratified by state.",
    )
    parser.add_argument(
        "--hf-token",
        default=None,
        help="HuggingFace token (or set HF_TOKEN env var).",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=42,
        help="Random seed for reproducibility.",
    )
    return parser.parse_args()


def read_parquets(paths: Iterable[str], hf_token: str | None = None) -> pl.DataFrame:
    frames = []
    storage_options: dict = {}
    if hf_token:
        storage_options["Authorization"] = f"Bearer {hf_token}"

    for p in paths:
        print(f"  Loading: {p}")
        # Try to read only required columns that actually exist
        try:
            if storage_options:
                frame = pl.read_parquet(p, storage_options=storage_options)
            else:
                frame = pl.read_parquet(p)
        except Exception as e:
            print(f"  Warning: could not load {p}: {e}")
            continue

        # Map persona column — dataset may use 'persona_professional' or just 'persona'
        if "persona_professional" not in frame.columns and "persona" in frame.columns:
            frame = frame.with_columns(pl.col("persona").alias("persona_professional"))

        # Keep only columns we need (skip missing ones gracefully)
        available = [c for c in REQUIRED_COLUMNS if c in frame.columns]
        missing = set(REQUIRED_COLUMNS) - set(available)
        if missing:
            print(f"  Note: missing columns: {missing} (will be filled with empty strings)")
            for col in missing:
                frame = frame.with_columns(pl.lit("").alias(col))

        frames.append(frame.select(REQUIRED_COLUMNS))

    if not frames:
        raise RuntimeError("No parquet files could be loaded.")
    return pl.concat(frames, how="vertical_relaxed")


def stratified_sample(df: pl.DataFrame, sample_size: int, seed: int) -> pl.DataFrame:
    states = df.select("state").unique().to_series().to_list()
    states = [s for s in states if isinstance(s, str) and s]

    if not states:
        raise RuntimeError("No states found after cleaning.")

    per_state_target = max(1, sample_size // len(states))
    sampled_frames = []

    for idx, state in enumerate(sorted(states)):
        state_df = df.filter(pl.col("state") == state)
        if state_df.height == 0:
            continue
        n = min(per_state_target, state_df.height)
        sampled_frames.append(
            state_df.sample(n=n, with_replacement=False, shuffle=True, seed=seed + idx)
        )

    sampled = (
        pl.concat(sampled_frames, how="vertical_relaxed") if sampled_frames else df.head(0)
    )

    if sampled.height >= sample_size:
        return sampled.sample(
            n=sample_size, with_replacement=False, shuffle=True, seed=seed + 997
        )

    # Top-up if we didn't hit target
    remaining_count = sample_size - sampled.height
    remaining = df.join(sampled.select("uuid"), on="uuid", how="anti").sample(
        n=min(remaining_count, max(0, df.height - sampled.height)),
        with_replacement=False,
        shuffle=True,
        seed=seed + 2048,
    )
    return pl.concat([sampled, remaining], how="vertical_relaxed")


def main() -> None:
    args = parse_args()

    # HF token — prefer CLI flag, fall back to env var
    import os
    hf_token: str | None = args.hf_token or os.environ.get("HF_TOKEN") or os.environ.get("HUGGING_FACE_HUB_TOKEN")
    if hf_token:
        print(f"Using HuggingFace token: {hf_token[:8]}…")
    else:
        print("No HF token — trying anonymous download (may fail for gated datasets).")

    output = Path(args.output)
    meta_output = Path(args.meta_output)
    output.parent.mkdir(parents=True, exist_ok=True)

    print("Loading persona parquets...")
    df = read_parquets(args.input, hf_token=hf_token)
    print(f"  Loaded {df.height:,} rows")

    # Drop rows with missing critical fields
    df = df.drop_nulls(["uuid", "state", "persona_professional", "age", "sex", "occupation"])

    # Normalize and cast
    df = df.with_columns(
        [
            pl.col("state")
            .cast(pl.Utf8)
            .map_elements(normalize_state, return_dtype=pl.Utf8)
            .alias("state"),
            pl.col("district").cast(pl.Utf8).fill_null("").alias("district"),
            pl.col("age").cast(pl.Int64),
            pl.col("sex").cast(pl.Utf8),
            pl.col("occupation").cast(pl.Utf8),
            pl.col("education_level").cast(pl.Utf8).fill_null("Not specified"),
            pl.col("marital_status").cast(pl.Utf8).fill_null("Not specified"),
            pl.col("persona_professional")
            .cast(pl.Utf8)
            .map_elements(lambda x: compact_text(x, 200), return_dtype=pl.Utf8)
            .alias("persona"),
            pl.col("cultural_background")
            .cast(pl.Utf8)
            .fill_null("")
            .map_elements(lambda x: compact_text(x, 130), return_dtype=pl.Utf8)
            .alias("cultural_background"),
            pl.col("skills_and_expertise")
            .cast(pl.Utf8)
            .fill_null("")
            .map_elements(lambda x: compact_text(x, 120), return_dtype=pl.Utf8)
            .alias("skills_and_expertise"),
            pl.col("hobbies_and_interests")
            .cast(pl.Utf8)
            .fill_null("")
            .map_elements(lambda x: compact_text(x, 120), return_dtype=pl.Utf8)
            .alias("hobbies_and_interests"),
            pl.col("career_goals_and_ambitions")
            .cast(pl.Utf8)
            .fill_null("")
            .map_elements(lambda x: compact_text(x, 120), return_dtype=pl.Utf8)
            .alias("career_goals_and_ambitions"),
        ]
    )

    # Select final columns
    df = df.select(
        [
            "uuid",
            "age",
            "sex",
            "occupation",
            "education_level",
            "marital_status",
            "state",
            "district",
            "persona",
            "cultural_background",
            "skills_and_expertise",
            "hobbies_and_interests",
            "career_goals_and_ambitions",
        ]
    )

    # Age filter (no minors)
    df = df.filter((pl.col("age") >= 18) & (pl.col("age") <= 100))

    print(f"  After cleaning: {df.height:,} rows")
    print(f"  States found: {df.select('state').unique().height}")

    # Stratified sample
    print(f"Sampling {args.sample_size:,} personas stratified by state...")
    sampled = stratified_sample(df, args.sample_size, args.seed)
    print(f"  Sampled: {sampled.height:,} rows across {sampled.select('state').unique().height} states")

    # Convert to records
    personas = sampled.to_dicts()

    # Write output
    payload = {"personas": personas}
    output.write_text(json.dumps(payload, ensure_ascii=False, indent=None), encoding="utf-8")
    print(f"Wrote {len(personas):,} personas -> {output}  ({output.stat().st_size / 1024:.1f} KB)")

    # Metadata
    state_counts = sampled.group_by("state").len().sort("state").to_dicts()
    meta = {
        "total": len(personas),
        "seed": args.seed,
        "states": {row["state"]: row["len"] for row in state_counts},
        "age_min": int(sampled["age"].min()),
        "age_max": int(sampled["age"].max()),
        "sex_counts": {
            row["sex"]: row["len"]
            for row in sampled.group_by("sex").len().to_dicts()
        },
    }
    meta_output.write_text(json.dumps(meta, indent=2), encoding="utf-8")
    print(f"Wrote metadata -> {meta_output}")


if __name__ == "__main__":
    main()
