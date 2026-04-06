from __future__ import annotations

import json
import re
from dataclasses import dataclass, asdict
from datetime import datetime
from pathlib import Path
from typing import List

from pypdf import PdfReader

ROOT = Path(__file__).resolve().parent
SOURCE_DIR = ROOT / "source"
OUT_PATH = ROOT / "index.json"
CHUNK_SIZE = 1400
OVERLAP = 220

KEYWORD_GROUPS = {
    "mediterranean diet": ["mediterranean", "olive oil", "nuts"],
    "salt and sodium": ["salt", "sodium", "low-salt"],
    "fruit and vegetables": ["fruit", "vegetable", "vegetables"],
    "whole grains": ["whole grain", "whole grains"],
    "legumes": ["legume", "beans", "lentils", "chickpeas"],
    "fish": ["fish", "seafood", "omega-3"],
    "processed foods": ["processed", "ultra-processed", "sugary drink", "sugar-sweetened"],
    "stroke prevention": ["stroke", "prevention", "risk reduction"],
}


@dataclass
class Chunk:
    id: str
    source_doc: str
    guideline_type: str
    section_title: str
    page_start: int
    page_end: int
    text: str
    normalized: str
    keywords: List[str]


@dataclass
class DocumentMeta:
    source_doc: str
    guideline_type: str
    pages: int


def normalize_text(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


def infer_guideline_type(filename: str) -> str:
    low = filename.lower()
    if "primary" in low or "2024" in low:
        return "primary_prevention"
    if "transient-ischemic" in low or "secondary" in low or "2021" in low:
        return "secondary_prevention"
    return "primary_prevention"


def extract_keywords(text: str) -> List[str]:
    low = text.lower()
    found: List[str] = []
    for label, patterns in KEYWORD_GROUPS.items():
        if any(p in low for p in patterns):
            found.append(label)
    return found


def guess_section_title(page_text: str) -> str:
    lines = [normalize_text(x) for x in (page_text or "").splitlines()]
    lines = [x for x in lines if x]
    for line in lines[:12]:
        if 4 <= len(line) <= 120:
            return line
    return "Guideline excerpt"


def split_into_chunks(text: str, chunk_size: int = CHUNK_SIZE, overlap: int = OVERLAP) -> List[str]:
    text = normalize_text(text)
    if not text:
        return []

    pieces: List[str] = []
    start = 0

    while start < len(text):
        end = min(len(text), start + chunk_size)
        if end < len(text):
            split_point = text.rfind(". ", start, end)
            if split_point != -1 and split_point - start > 500:
                end = split_point + 1

        piece = text[start:end].strip()
        if piece:
            pieces.append(piece)

        if end >= len(text):
            break

        start = max(end - overlap, start + 1)

    return pieces


def build_index() -> dict:
    pdf_files = sorted(SOURCE_DIR.glob("*.pdf"))
    if not pdf_files:
        raise FileNotFoundError(f"No PDF files found in {SOURCE_DIR}")

    documents: List[DocumentMeta] = []
    chunks: List[Chunk] = []

    for pdf_path in pdf_files:
        reader = PdfReader(str(pdf_path))
        guideline_type = infer_guideline_type(pdf_path.name)

        documents.append(
            DocumentMeta(
                source_doc=pdf_path.name,
                guideline_type=guideline_type,
                pages=len(reader.pages),
            )
        )

        for page_idx, page in enumerate(reader.pages, start=1):
            raw_text = page.extract_text() or ""
            page_text = normalize_text(raw_text)
            if len(page_text) < 80:
                continue

            section_title = guess_section_title(raw_text)
            page_chunks = split_into_chunks(page_text)

            for idx, piece in enumerate(page_chunks, start=1):
                chunks.append(
                    Chunk(
                        id=f"{pdf_path.stem}_p{page_idx:03d}_c{idx:02d}",
                        source_doc=pdf_path.name,
                        guideline_type=guideline_type,
                        section_title=section_title,
                        page_start=page_idx,
                        page_end=page_idx,
                        text=piece,
                        normalized=piece.lower(),
                        keywords=extract_keywords(piece),
                    )
                )

    return {
        "created_at": datetime.utcnow().isoformat() + "Z",
        "meta": {
            "builder": "simple_pdf_chunker",
            "chunk_size": CHUNK_SIZE,
            "overlap": OVERLAP,
        },
        "documents": [asdict(d) for d in documents],
        "chunks": [asdict(c) for c in chunks],
    }


def main() -> None:
    index = build_index()
    OUT_PATH.write_text(json.dumps(index, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Saved {len(index['chunks'])} chunks to {OUT_PATH}")


if __name__ == "__main__":
    main()