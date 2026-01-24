Benchmarks
==========

This folder tracks EPUB performance benchmarks and acceptance tests.

Checklist:
- Collect EPUB 2/3 samples (Project Gutenberg + known edge cases).
- Track import time, peak memory, and chunk generation counts.
- Track reader latency (first chunk render + next chunk fetch).

Suggested data to record per book:
- Title
- File size
- EPUB version
- Import duration
- Peak memory
- Sections count
- Chunks count

Next steps:
- Add a script that posts EPUBs to the parser service and logs timings.
- Add a small dataset manifest (file path + expected metadata).
