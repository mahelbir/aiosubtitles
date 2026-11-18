import json
import sys
from typing import Any

from guessit import __version__ as guessit_version
from guessit import guessit

PINNED_GUESSIT_VERSION = "4.5.1"
USAGE = "Usage: guessit-dump.py <names.json> <guessit-output.json>"
JSON_INDENT = 2


class GuessitEncoder(json.JSONEncoder):
    def default(self, o: Any) -> Any:
        if hasattr(o, "name"):
            return str(o.name)
        return str(o)


def dump_guessit_readings(names_path: str, output_path: str) -> int:
    if guessit_version != PINNED_GUESSIT_VERSION:
        raise SystemExit(f"guessit {PINNED_GUESSIT_VERSION} is required.")
    with open(names_path, encoding="utf-8") as names_file:
        release_names = json.load(names_file)["releaseNames"]
    parsed_by_name = {
        release_name: guessit(release_name) for release_name in release_names
    }
    with open(output_path, "w", encoding="utf-8") as output_file:
        json.dump(
            {"guessitVersion": guessit_version, "parsedByName": parsed_by_name},
            output_file,
            cls=GuessitEncoder,
            ensure_ascii=False,
            sort_keys=True,
            indent=JSON_INDENT,
        )
        output_file.write("\n")
    return len(parsed_by_name)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit(USAGE)
    dumped_count = dump_guessit_readings(sys.argv[1], sys.argv[2])
    print(f"guessit {guessit_version}: {dumped_count} names")
