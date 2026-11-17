# AIOSubtitles evaluation metrics, version 1 (frozen v1)

Status: frozen v1. This file freezes as `apps/eval/metrics.md`. Its SHA-256 goes to `apps/eval/metrics.lock` before any scoring code reads the corpus (spec §15.4). Once frozen, it does not change. A change opens `metrics-v2.md`, and old reports stay bound to v1.

Sources: spec §9, §10, §15; `brainstorming.md` §6 and §8; decision ledger, open point 4. Implementation facts (paths, fields, counts, pitfalls) are in `docs/superpowers/eval/eval-harness-notes.md`. If the two files disagree on a definition, this file wins.

Note on paths: `docs/superpowers/` is excluded from git by `.git/info/exclude`. The frozen copy that gets committed is `apps/eval/metrics.md`.

## 0. Rules that apply to every metric

| Rule | Statement |
|---|---|
| Read-only corpus | The harness reads Atlas by absolute path (`--atlas <path>`) and writes nothing there. |
| No tuning on the corpus | Weight tables are scored and reported. No weight is changed after looking at a result. The only corpus-fitted parameters are the time-family parameters (§5) and the tier-4 threshold (§4.3). Both use the selection rule fixed in this file. |
| Weight learning | Not run until at least 10 videos have at least one `fits` content group (spec §15.1, ledger open point 4). Today 4 videos qualify (V06, V08, V15, V25). Until then, the "learned table" row of every report says `not run: <k>/10 videos with fits`. When it runs, only videos that also have a `wrong` group become folds (§3.3). |
| Privacy | Committed reports hold aggregates and video codes only. No release names, file names, rowIds, candidate ids, URLs, hashes of private files or tokens. Row details go to `apps/eval/.out/` (git-ignored). |
| Determinism | The same corpus and the same code give byte-identical reports. No wall-clock time, no unseeded randomness, no network. |
| Corpus fingerprint | Every report records the SHA-256 of `eval/corpus/index.json` and of each `eval/corpus/<code>/case.json` it read, and the SHA-256 of this file. |

## 1. Units, labels and which videos enter

### 1.1 Unit of ranking: the content group

- Rows: the current Orion list of each video (`case.json` → `poolList`). A row enters only if its `candidateId` is non-null and the candidate has `isValid === true`.
- Content group: valid pool rows of one video that share `candidateKey` (local.json). This is Atlas's normalised content key. It is the tier-3 truth (§4).
- A group carries one class. Group class = the `expectedClass` of the one candidate in the whole video (pool or not) that has that `candidateKey` and a non-null class. That candidate is the first one with the key. It is outside the current pool for 39 of 255 groups, so the lookup must not be limited to pool rows. Verified: every valid group has exactly one classed candidate, and no key has two classes.
- A group's score under a table = the maximum, over its member rows, of that table's row score. This mirrors spec §9.2 ("in a merged row, name signals are computed per release name and the highest is taken"). The same rule applies to every table.
- Secondary view, descriptive only: rows instead of groups. Each valid pool row inherits its group's class. The same metrics are computed and reported in a separate table. No win/tie decision is made on this view.
- Rows that are invalid, failed, delisted, or missing from the current list are not ranked. One descriptive count is reported per table: invalid current-pool rows that score above the best positive group (§2.6).

### 1.1a What the scorer receives about the video

- Video file name: `local.json` → `stream.fileName`. Catalog id: `stream.catalogId` (`tt…` for films, `tt…:<season>:<episode>` for episodes). Video size: `stream.sizeBytes`.
- No video hash is supplied. The Orion lists were fetched without a file name or hash, so no row carries a hash match.
- No fps or runtime from the video. Subliminal's fps row and the catalog runtime check are "unknown".
- The no-video-info mode (spec §9.5) is out of scope for v1. Every ranking run gets the file name and the catalog id.

### 1.1b Groups a table removes

A table may mark a group "certainly wrong" (spec §9.1) or otherwise drop it. A dropped group is placed below every kept group. All dropped groups of a video tie with each other, and the tie rules of §2 apply to them. Each report lists, per table and label, the number of positive groups dropped and their video codes. A dropped positive is the most serious error a list-time rule can make.

### 1.2 Language

Every corpus row is Turkish (`tur`). The unit of analysis is (video, language), which here is (video, `tur`). The harness still groups by language, so a future multi-language corpus needs no metric change.

### 1.3 Labels

| Label | Positive | Negative | Ignored in pairs |
|---|---|---|---|
| Y1 | `fits` | `wrong` | `constant`, `drift`, `steps`, `recap` |
| Y2 | `fits`, `constant` | `wrong` | `drift`, `steps`, `recap` |

- Y1 is the decision label. Final claims about ranking quality use Y1.
- Y2 is a hypothesis label (same cut as the video). It is reported next to Y1 and would be used for weight learning.
- Ignored classes stay in the ranked list for the rank metrics (§2.2–2.5). They are neither positive nor negative there. A top row of an ignored class is "not positive". It is not counted as a worst error (§2.5).

### 1.4 Which videos enter each metric

A video is informative for a label when its ranked list holds at least one positive group and at least one group that is not positive.

| Metric | Videos (today) |
|---|---|
| Pair order, Y1 | Videos with ≥1 `fits` group and ≥1 `wrong` group: V06, V08, V15 |
| Pair order, Y2 | Videos with ≥1 Y2-positive group and ≥1 `wrong` group: V04, V06, V08, V15, V19, V41 |
| Top-1, first-positive rank, Y1 | Informative for Y1: V06, V08, V15 |
| Top-1, first-positive rank, Y2 | Informative for Y2: V04, V06, V08, V15, V19, V41 |
| Worst error | Same videos as top-1 for that label |
| Dedup (§4) | All 12 videos |
| Time family (§5) | Per sub-metric, see §5 |

- V25 has only `fits` groups (3). Every order gives the same result, so it enters no ranking metric. It is listed in reports as "non-informative".
- E16, E17, V01, V13, V21 have only `wrong` groups. They enter no ranking metric.
- The harness computes these sets from the data at run time. It does not hard-code them. If they differ from the table above, the report prints both and the run continues.

### 1.5 Truth caveat (reported, not acted on)

`case.json` → `truthAudit.status` is `suspect` for V01, V06, V13, V15, V19, V21. That status means at least one audit check failed. For V06 and V15, one second-track comparison out of 20 and 9 checks failed. Classes come from Atlas's classifier against `truth`, so they are labels from a single source. Every report prints the audit status next to each video code. Every ranking metric also gets a "passed-audit only" sensitivity line. Today that leaves Y1 with V08 only and Y2 with V04, V08, V41. No decision is made on the sensitivity line.

## 2. Ranking metrics

All are computed per informative video, then averaged over videos with equal weight (macro mean). Pairs are never pooled across videos. V15 alone holds 336 of the 370 Y1 pairs.

Ties in score are never broken with data the corpus lacks (download count, `url_code`) or with Orion's served order. Each tie gets its expected value under a uniformly random order of the tied groups. The formulas below do this.

### 2.1 Pair order (primary metric)

For video v and label Y, let P be the positive groups and N the negative groups. s(g) is the group score.

```
pairOrder(v) = ( #{(p,n) : s(p) > s(n)} + 0.5 · #{(p,n) : s(p) = s(n)} ) / (|P| · |N|)
PairOrder(Y) = mean over informative videos of pairOrder(v)
```

- Range 0–1. A random order gives 0.5.
- Scores are compared as exact numbers. Tables use integers or fixed decimals, so equality is exact. If a table produces floats, scores are rounded to 6 decimals before comparison.
- Pair counts today (group level): Y1: V06 26, V08 8, V15 336. Y2: V04 58, V06 130, V08 8, V15 624, V19 136, V41 16.

### 2.2 Top-1

```
top1(v) = p_top / k_top
```

k_top is the number of groups tied at the highest score. p_top is the number of positives among them. `Top1(Y)` = mean over informative videos.

### 2.3 Rank of the first positive

Sort groups by score, descending, into tie blocks. Let B be the first block that holds a positive. Let a be the number of groups in blocks above B, k the size of B, and p the number of positives in B.

```
firstPositiveRank(v) = a + (k + 1) / (p + 1)
```

This is the expected 1-based position of the first positive under a random order inside the tie block. Reports give the per-video value and the macro mean. Lists differ in length, so each report also gives `negativesAbove(v)` = the expected number of `wrong` groups above the first positive. It uses the same block rule: wrong groups in higher blocks, plus (wrong groups in B) / (p + 1).

### 2.4 Mean reciprocal rank (secondary)

`mrr(v) = E[1 / position of first positive]` under the same tie rule. It is computed exactly by enumerating positions inside block B. Descriptive only.

### 2.5 Worst error

For each informative video: `worst(v)` = the probability that the top position holds a `wrong` group = w_top / k_top, where w_top is the number of `wrong` groups among the k_top groups tied at the top.

- `WorstErrorCount(Y)` = sum of `worst(v)` over informative videos. This is the expected number of videos where a wrong subtitle sits on top while a positive exists.
- Reports also list the video codes where `worst(v) > 0`.

### 2.6 Invalid rows above the best positive (descriptive)

Per video: the number of current-pool rows with `isValid === false` whose table score is higher than the best positive group's score. Ties count 0.5. This shows what a list-time ranking would put on top before a download proves the file bad. No decision is made on it.

## 3. Spread, comparison and ties

### 3.1 Resampling over videos

Videos are the resampling unit for every ranking metric. Pairs, rows and groups are never resampled on their own.

- n = number of informative videos for the metric. If n^n ≤ 1,000,000 (n ≤ 7), the harness enumerates every ordered resample with replacement (n^n of them, equal weight). This is the exact bootstrap distribution. It needs no random numbers. Today n = 3 (27 resamples) and n = 6 (46,656 resamples).
- If n ≥ 8: 10,000 resamples. PRNG: `mulberry32`, seed `20261117`. The video index is `floor(u · n)` for each draw, n draws per resample, resamples drawn in order. Videos are sorted by code (string compare) before drawing.
- The statistic on each resample is the macro mean of the per-video values in that resample (a video drawn twice counts twice).
- Confidence interval: 95% percentile interval. Lower bound = the smallest value whose cumulative weight is ≥ 0.025. Upper bound = the smallest value whose cumulative weight is ≥ 0.975.
- Reports show: point estimate (the macro mean on the original videos), the interval, and n.

### 3.2 Comparing two tables

- Paired: both tables are scored on the same resample. The statistic is the difference of the two macro means, A − B.
- A beats B on a metric only if the lower bound of the 95% interval of (A − B) is > 0. Otherwise they tie on that metric. For worst error, lower is better, so the test uses B − A.
- Consequence: with n = 3 and exact enumeration, the resample made of the single worst video drawn three times has weight 1/27 > 0.025. So A beats B on Y1 only if A is strictly better on every one of V06, V08 and V15. Most Y1 comparisons will be ties. This is the intended conservative behaviour, and reports say so in one line.
- The decision metric is Y1 pair order. A table is "best" only if it beats every other table on it. Otherwise the report names the set of tables that are not beaten by any other table.
- Every report includes a win/tie matrix for Y1 pair order and Y2 pair order.

### 3.3 Leave-one-video-out (LOVO)

| What | LOVO? |
|---|---|
| Ready-made weight tables (§6) | No. They are not fitted to this corpus. |
| Learned table | Yes, when it is allowed (≥10 videos with fits, §0). Folds = videos with Y-comparable pairs. Each held-out video is scored with weights learned on the other folds only. The reported numbers are the held-out scores. Resampling (§3.1) then runs over the held-out per-video values. |
| Time-family parameters (§5.3) | Yes, always. |
| Tier-4 threshold (§4.3) | No. τ comes from the fixed derivation in §4.3, which can only raise it above a cross-class similarity. |

## 4. Deduplication metrics

Truth for "same content" is `candidateKey` equality inside one video. `candidateKey` is Atlas's hash of the sorted `[startMs, endMs, normalised text]` cue list. `contentDigest` is not used as the content key: it is an HMAC of `rawSha256`, so it only marks byte-identical raw files. Pairs are unordered pairs of valid current-pool rows in the same video.

Today: 451 valid pool rows, 255 groups, 311 same-content pairs (98 of them byte-identical).

### 4.1 Tier 1-2 recall without download (D1)

- Tier 1 key per row: (source, site file id, archive entry path). The corpus rows come through Orion proxy URLs, so an eval-side adapter parses the site id from the list URL. That adapter is harness code, not product code. The product's tier-1 rule is then applied to the parsed keys. File contents are never read for D1.
- Tier 2 needs alias data (spec §7.4: an intermediary that names the original site's id). The corpus has none, so tier 2 is not measurable. Reports print "tier 2: not measurable" and D1 covers tier 1 only.
- `D1.pairRecall` = (same-content pairs merged by tier 1) / (all same-content pairs). Reported per source pair type (same site, cross-site) and in total.
- `D1.rowReduction` = (rows − clusters after tier 1) / (rows − groups). This is the share of removable rows that tier 1 removes.
- `D1.falseMerges` = pairs merged by tier 1 whose `candidateKey` differs. Must be 0. Any non-zero value is listed by video code.
- Expected today: recall ≈ 0. Every valid pool row has a distinct site id, because Orion already merged same-id rows. This number describes the corpus, not the method. The report prints that sentence. No decision rests on D1 until a corpus built from direct site queries exists.

### 4.2 Tier-3 key agreement (D2)

The product's `content_key` (spec §10.3) is computed from the frozen raw file (`rawSha256` blob) of every valid pool row.

- `D2.precision` = pairs with equal `content_key` that also share `candidateKey` / pairs with equal `content_key`.
- `D2.recall` = pairs sharing `candidateKey` that also have equal `content_key` / pairs sharing `candidateKey`.
- Hard requirement: every byte-identical pair (same `rawSha256`) gets the same `content_key`.
- `D2.crossClass` = pairs with equal `content_key` but different group class. Must be 0.
- Reported per video and in total. Macro and micro are both shown, because dedup is not a ranking quality.

### 4.3 Tier-4 threshold rule (D3)

Tier 4 runs on pairs of distinct groups (different `candidateKey`) in one video whose cue times are "the same" by the product's tier-4 rule. On those pairs, the product computes its text similarity.

- Rule: two groups of different class must never merge. `D3.crossClassMerges` must be 0.
- Similarity: per time-equal pair, the mean over aligned cues of `1 − levenshtein(a, b) / max(len(a), len(b))` on normalised text (spec §10.3 step 4).
- Threshold, fixed now: τ₀ = 0.90. Derivation from the corpus: let s_x be the maximum similarity over cross-class, time-equal pairs. Then τ = max(τ₀, s_x + 0.01). If no cross-class, time-equal pair exists, τ = τ₀ and the report says "cross-class rule not testable on this corpus".
- Reported: number of time-equal pairs, cross-class pairs among them, s_x, τ, cross-class merges at τ, and same-class merges at τ. These are reported per video and in total.
- τ₀ and the derivation change only through a new metrics version. A run cannot re-propose τ.
- Data today: with exact cue-time equality, 68 group pairs are time-equal (V15 47, V04 9, V19 7, V41 2, E16 1, E17 1, V25 1). None is cross-class. So the cross-class rule is not testable with exact equality. It becomes testable only if the product's time rule allows a tolerance.
- Warning (from the data): Atlas's `timeFamily` puts `fits` and `wrong` groups in the same family in V15 (24 cross-class pairs). A loose "same timing" rule (for example, matching a short file's cue starts as a subset of a long file's) will fail D3.

## 5. Time-family agreement

The product's decision `is_same_time_family(reference, candidate)` (spec §9.6) is scored two ways.

### 5.1 T1: agreement with Atlas's `timeFamily` labels

- Items: ordered pairs (a, b) of distinct valid groups in one video. a is used as the reference and b as the candidate. Both orders are scored, because the product's decision is not guaranteed to be symmetric.
- Truth: same family iff `timeFamily(a) === timeFamily(b)` (both non-null).
- Per video: precision, recall, and balanced accuracy = (TPR + TNR) / 2. A video enters a sub-metric only when it is defined there. Balanced accuracy needs both same-family and different-family pairs. Today that is E16, E17, V01, V04, V06, V08, V15, V19, V41. V13 and V25 have only same-family pairs, so they enter recall only. V21 has one group and enters nothing.
- Aggregate: macro mean over entering videos. Spread by §3.1 over those videos.
- Separate count: `T1.crossClassSame` = predicted-same pairs whose groups differ in class. It is reported per video.
- Caveat stated in every report: `timeFamily` is the output of Atlas's own grouping rule (cue-start tolerance 100 ms, matched share 0.9, measured on the smaller track, greedy assignment). It is not an independent truth. High T1 means "behaves like Atlas's rule".

### 5.2 T2: truth track as the reference

- For each video and each valid group g: prediction = `is_same_time_family(truth, g)`. The truth cues come from `case.json` → `truth.cues` (start and end only). Truth: `class(g) === 'fits'`.
- Per video: precision and recall for `fits`. Aggregate: macro mean over videos with ≥1 `fits` group and ≥1 non-`fits` group (V06, V08, V15). V25 enters recall only.
- T2 shows how well the +900/−300 signal (spec §9.3) would separate `fits` from everything else, if the reference were perfect. It is not a ranking metric.

### 5.3 Selecting the time-family parameters

Spec §9.6 leaves the tolerance and threshold to the corpus. They are chosen like this, and nothing else may be tuned:

- Grid: start tolerance ∈ {50, 100, 150, 200, 250, 300, 350} ms × matched-share threshold ∈ {0.80, 0.85, 0.90, 0.95}. The near-zero offset and near-one ratio limits are set by the implementer before the run and recorded. They are not on the grid.
- Criterion: T1 macro balanced accuracy over the training videos. Ties go to the smaller tolerance, then the higher share.
- LOVO: for each video, choose on the other videos, then score T1 and T2 on the held-out video. Reported T1 and T2 are these held-out values.
- After LOVO, the final setting is chosen on all videos by the same criterion and recorded. The LOVO numbers are its expected quality.

## 6. Competing weight tables

| Table | How it is built |
|---|---|
| Orion | Rewritten from observed behaviour and its source. No code copied. |
| Lyra | Same. |
| Vega | Same. |
| Subliminal | Default weights. Its fps row needs the video's fps, which the player does not send, so only name-derived signals run. |
| Bazarr | Default weights. |
| Ours | Spec §9.2 starting table (`brainstorming.md` §5). |
| Strict priority | The "no negative scores, strict priority" approach used by the ready-made tables, run as its own entry. |
| Orion served order | Baseline: score = −(position in the Orion list). It is Orion's real order for a request without a file name or hash, because the lists were fetched that way. It is not Orion's best case. |
| Learned table | Not run until §0 allows it. |

- All tables live as data in `@repo/subtitle-core/scoring` and use the same signal extractor and name parser.
- Tables are compared, not tuned. No number in any table changes because of a result on this corpus.
- Signals the corpus cannot supply are "unknown" (0) for every table alike: hash match, trusted uploader, download count, machine translation, fps from the video, catalog runtime check. Signals it can supply: release-name signals, source site, SDH flag (` · HI`), forced flag (` · Yabancı konuşmalar`), paid flag (`1 hak harcar`).
- Primary run: list-time signals only (spec §9.2). Secondary run, for "Ours" only: adds the post-download signals that need no reference: copy count across sites (§9.3, from group members' distinct sources) and line count against duration. The reference time-family signal is never used in ranking runs. In this corpus, the only reference is the truth track, and using it would leak the label.

## 7. Name-parser test

Purpose: decide only whether guessit is ported to JavaScript (spec §15.6, decision 12).

### 7.1 Contestants and lineages

| Library | Lineage (its own test files, never used to score it) |
|---|---|
| guessit (run once in Python on a developer machine, output saved as JSON) | guessit `test/*.yml` |
| `@ctrl/video-filename-parser` | Sonarr `ParserTests` |
| `@aiostreams/release-parser` | PTT `tests` and go-ptt tests (it is a go-ptt port) |
| `parsium-media` | None known. It is scored on all three external sets. |

### 7.2 Data

- Own names: distinct video file names from `identities.json` ∪ `eval-corpus-candidates-data/*.json` (64), and distinct subtitle release names from the 34 frozen Orion lists. Extraction: take `label` (not `id`), take the part after the first ` | `, split on ` _ `, trim, and dedupe. Today that gives 325 names. Earlier research counted 276 with an unstated rule. The report prints the count produced by this rule.
- Own labels: fields where all four libraries agree after normalisation are accepted. Fields where they disagree are labelled by hand before the run. A 10% random sample of the agreed fields (mulberry32, seed 20261117) is also checked by hand, and its error rate is reported. The labels file is private. It lives in a git-ignored folder, and its SHA-256 goes into the committed report.
- External names: guessit `movies.yml`, `episodes.yml`, `various.yml`; Sonarr `src/NzbDrone.Core.Test/ParserTests/*.cs`; PTT `tests/*.py` (+ go-ptt `*_test.go`). Taken from `.reference/` at a commit hash that is recorded in the report.

### 7.3 Fields and scoring

- Fields: group, source, service, edition, season, episode, title, year.
- Normalisation, fixed before the run:
  - title: NFC, case-fold, punctuation to space, spaces collapsed;
  - group: case-fold;
  - source: family (BluRay, WEB, HDTV, DVD, other; WEB-DL ≡ WEBRip; Remux → BluRay);
  - service: short code from one mapping table (NF, AMZN, DSNP, ATVP, HMAX, HULU, …);
  - edition: canonical set (Extended, Director's Cut, Theatrical, Unrated, Uncut, IMAX, Remastered, Special);
  - season and episode: sets of integers;
  - year: integer.
  The mapping table is committed with the harness before the first run.
- An item is a (name, field) pair that the source labels. External fixtures are scored only on the fields they assert. Absence is scored only where the fixture asserts absence. Own names are scored on all 8 fields, including "absent".
- Correct = the normalised values are equal (for sets, set equality).
- Per-field accuracy = correct / items. Library score = unweighted mean of the 8 per-field accuracies. A field with no items is left out and named.

### 7.4 Spread and comparison

- Resampling unit: names. 10,000 resamples, mulberry32, seed 20261117, names sorted by their SHA-256 before drawing. Paired between libraries on the same resample.
- Two libraries are compared only on names both may be scored on: own names plus the external sets outside both lineages. guessit vs video-filename-parser uses PTT; guessit vs release-parser uses Sonarr; guessit vs parsium uses Sonarr and PTT.
- Tie rule as in §3.2. The 95% interval of the paired difference must exclude 0.

### 7.5 Decision rule

1. Best JS library = the highest library score on own names. If it ties with another JS library, both are carried forward.
2. guessit is ported only if (a) it beats every carried JS library on own names, and (b) it does not lose to any of them on their shared external set.
3. Otherwise the best JS library is used. When guessit is ported, the edge cases the JS libraries solve are reviewed too (decision 11).
4. Per-field results are always reported. A port that wins overall but loses on season or episode is flagged, because those fields drive the "certainly wrong" rule (spec §9.1).

## 8. Report format

- File: `apps/eval/reports/<YYYY-MM-DD>-<name>.md`, committed.
- Header: metrics version and SHA-256, corpus fingerprint (§0), code commit, signal and parser versions, the run's choices (τ for tier 4, time-family setting).
- Body, aggregates and video codes only:
  1. Video table: code, audit status, groups, positives and negatives per label, informative or not.
  2. Ranking: one row per table, with pair order, top-1, first-positive rank, negatives above, MRR and worst error, for Y1 and Y2. Each value has its point estimate, 95% interval and n. A per-video column block follows.
  3. Win/tie matrices (§3.2) and the "not beaten" set.
  4. Passed-audit-only sensitivity lines and the row-level secondary view.
  5. Dedup D1–D3. Time family T1–T2 (held-out values).
  6. Name-parser test: per-field accuracy per library per data set, pairwise comparisons and the decision.
  7. "Not run" lines (learned table) and "not measurable" lines (D1 caveat, untestable D3).
- Detail rows (candidate ids, rowIds, scores, names, per-pair outcomes) go to `apps/eval/.out/<run>/` only. That folder must be listed in `.gitignore` before the first run.
- Never in any output: URLs, `auth=` tokens, video file names, raw hashes from `identities.json`.
