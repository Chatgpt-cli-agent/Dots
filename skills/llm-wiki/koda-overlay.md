# Koda Tool Mapping

This skill was authored for Hermes Agent and names Hermes-native tools. In Koda,
use Koda's tools instead — they cover every operation below:

- `terminal` → `terminal` (Koda's shell tool; same name)
- `read_file` → `read_files` (accepts a list of paths)
- `search_files` → `search_codebase`
- `patch` / `write_file` → `apply_patch`
- `web_extract` (URL → markdown, incl. PDFs) → `web_search` with the `url` parameter to fetch full page text
- `execute_code` → `python` (Koda's code-execution tool)

WIKI_PATH: default `~/wiki` (Koda's $HOME). No environment file is needed for
this machine; set the path in your first prompt if you want it elsewhere.