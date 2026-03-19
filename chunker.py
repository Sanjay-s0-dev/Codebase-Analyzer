CHUNK_SIZE    = 4500
CHUNK_OVERLAP = 300

def _chunk_text(text: str) -> list[str]:
    # Slide a window of CHUNK_SIZE chars;CHUNK_OVERLAP for context continuity
    chunks, start = [], 0
    while start < len(text):
        chunks.append(text[start : start + CHUNK_SIZE])
        start += CHUNK_SIZE - CHUNK_OVERLAP
    return chunks

def build_file_chunks(files: list[dict]) -> list[dict]:
    # Split each file into overlapping chunks; small files stay as a single chunk
    result = []
    for f in files:
        parts = [f["content"]] if len(f["content"]) <= CHUNK_SIZE else _chunk_text(f["content"])
        for i, part in enumerate(parts):
            result.append({"file_path": f["path"], "chunk_index": i,
                           "total_chunks": len(parts), "text": part})
    return result

def group_chunks_into_batches(chunks: list[dict], batch_char_limit: int = 12_000) -> list[list[dict]]:
    # Pack chunks into batches that stay under batch_char_limit to fit Groq's context window
    batches, current, size = [], [], 0
    for chunk in chunks:
        n = len(chunk["text"])
        if current and size + n > batch_char_limit:
            batches.append(current); current, size = [], 0
        current.append(chunk); size += n
    if current: batches.append(current)
    return batches

def format_batch_for_prompt(batch: list[dict]) -> str:
    # Render chunks as labelled file blocks so the LLM knows which file each piece belongs to
    lines = []
    for c in batch:
        header = f"### FILE: {c['file_path']}"
        if c["total_chunks"] > 1:
            header += f"  [chunk {c['chunk_index']+1}/{c['total_chunks']}]"
        lines += [header, c["text"], ""]
    return "\n".join(lines)
