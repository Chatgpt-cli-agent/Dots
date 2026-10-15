# Repairing a Broken .package — High-Level Workflow

## First: confirm it's actually a DBPF

A file named `.package` with a wrong or corrupt header may not be a DBPF at
all. Check the magic bytes / container structure before assuming. See
`dbpf-2.1.md`.

## Common failure modes

- Truncated file (incomplete download or save).
- Corrupt resource index (header/index mismatch).
- Wrong or duplicate resource keys (TGI).
- Bad compression or an orphaned resource entry.

## Workflow

1. **Back up the original** before touching it.
2. **Open it in Sims 4 Studio first** — S4S validates the package and, on save,
   rewrites a clean index/header. Many "broken" packages are fixed by a simple
   open + re-save.
3. **If S4S cannot open it**, use **s4pe** to inspect the header and resource
   index directly. Check:
   - the DBPF version and header size;
   - the index count vs. actual entries;
   - TGI keys for duplicates or invalid entries.
4. **Remove or repair** the broken resource — delete an orphaned entry, fix a
   duplicate TGI, or re-import a missing resource.
5. **Re-save and re-test** in game.

## When to escalate

If the file is truncated or the index is unrecoverable, the resource bytes may
be gone. A clean re-download from the source is often the correct fix rather
than surgery. Do not silently reconstruct bytes — the sims-4 skill requires
evidence, not guessing.

For byte-level structure (96-byte header, index flags, extended entries), read
`dbpf-2.1.md` and `s4s/dbpf-verification.md`.
