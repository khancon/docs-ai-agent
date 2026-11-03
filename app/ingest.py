"""Compatibility entrypoint for offline corpus creation (never imported at startup)."""

from scripts.build_corpus import main

if __name__ == "__main__":
    main()
