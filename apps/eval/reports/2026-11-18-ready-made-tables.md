# Ready-made scoring tables (2026-11-18)

- Metrics: v1. Metrics SHA-256: 2b6bcc1b1980e3bd59ba76beef0e9e239b4094df1fdbef0bda94d844730e0d2b
- Corpus index SHA-256: 34193d0d9598dcc8fedd675d16baffac2b283770056377db234e1fc745128fbe
- Case SHA-256: E16 30e31d7193c92f1d2d0986339a39f8e91c370b5ede89ecaadde4e503fce3030e, E17 f012d944d1de398351c16c86db41322b8107ae4745b6db9a4934274a75c448a1, V01 bb1e1c2a1ae49ee7316bb75b4ee609d0bbb00b45ef57b3f97a0d8b5602a6b80c, V04 48895f4758824f36f0ff77e3e7b988ee803d434376649500b68cfb9ab6d89b21, V06 480d50a715a78b93d4116231005f102423282808ac2eeba83ec7b372628dacd2, V08 47ebcdd4b83ca01b9dbc9ec15a7a3c0dc01866ef2757368d043c326613f9cc6c, V13 f37fe85732fb169746dd32eca21f5d6d6d879b91131b8f3d1257fc295b153f82, V15 4a6c0bc467f16f5d695e6ee8c8457aa8c3ee5cb42aff3e4f7a36e184c77cac53, V19 a6bcedce17c770829220709973798728999df5d3f5b04374ae9cfc5878543dac, V41 793e74c9de9cb60b546d239a30482de90a42acae8f6fe053a6cc47ccb8a8bf6c, V21 449df0826d7011a9f1647b0d4eff25319d8d09944774674d403b725a0d4d1ea3, V25 e32c45efc136aed953c722c7eafd7f61a8cda4850ea8240a1b45d3d8cb9ce421
- Code: eval source tree 4a0ee836a7e4af18331c746515e3130f466208be, subtitle-core source tree 416efd7f866a755a0539a0b6a2e9818ed3a20bd0
- Uncommitted source changes: no
- Tables: aiosubtitles, orion, lyra, vega, subliminal, bazarr, strict-priority; baseline: Orion served order, score = −(1-based list position).
- Scorer input: the video file name and the catalog id only. No video hash, fps or runtime (metrics §1.1a).
- Primary run: list-time signals only. File validity, the reference time family and the catalog runtime stay unknown for every table (metrics §6). Invalid rows are ranked with file validity unknown and counted on their own line (§2.6).
- Secondary run (aiosubtitles only): adds the copy count across sites, from the product duplicate groups at τ, and the line count against the video duration from the candidates data (unknown without a record). File validity still never acts.
- Secondary copy count and labels: τ is derived from cross-class similarity (metrics §4.3), so the copy count is free of labels only while τ = τ₀ (true on this run).
- Signal and parser versions: carried by the subtitle-core source tree hash above (signal extractor, score tables and the parsium-media name parser it pins); timing comparison method v1.
- Line count against duration (cue-shape) limits, placeholders not yet tuned: last cue end 0.5–1.25 × duration, at least 1 cue per minute.
- Time-family limits, fixed before the run (metrics §5.3): near-zero offset ≤ 150 ms; near-one ratio |ratio − 1| ≤ 0.0005.
- Time-family setting chosen on all videos: start tolerance 100 ms, matched share ≥ 0.8 (T1 balanced accuracy 0.937).
- Tier-4 threshold τ = 0.9 (τ₀ 0.9; highest cross-class similarity —).
- Resampling: videos sorted by code, exact enumeration when n ≤ 7, otherwise 10000 resamples with mulberry32 seed 20261117.
- Known gap: the ready-made tables lose their "name states the requested episode or title" match points (Vega +2000, Lyra +50). No signal carries them, so those tables cannot reward a name that states the right episode or title.

## Videos

| Video | Audit | Groups | Invalid rows | Y1 + / − | Y1 informative | Y2 + / − | Y2 informative |
| --- | --- | --- | --- | --- | --- | --- | --- |
| E16 | passed | 6 | 0 | 0 / 6 | no | 0 / 6 | no |
| E17 | passed | 9 | 0 | 0 / 9 | no | 0 / 9 | no |
| V01 | suspect | 8 | 0 | 0 / 8 | no | 0 / 8 | no |
| V04 | passed | 43 | 38 | 0 / 29 | no | 2 / 29 | yes |
| V06 | suspect | 25 | 4 | 2 / 13 | yes | 10 / 13 | yes |
| V08 | passed | 6 | 0 | 4 / 2 | yes | 4 / 2 | yes |
| V13 | suspect | 4 | 0 | 0 / 4 | no | 0 / 4 | no |
| V15 | suspect | 61 | 19 | 7 / 48 | yes | 13 / 48 | yes |
| V19 | suspect | 72 | 23 | 0 / 68 | no | 2 / 68 | yes |
| V21 | suspect | 1 | 0 | 0 / 1 | no | 0 / 1 | no |
| V25 | passed | 3 | 0 | 3 / 0 | no | 3 / 0 | no |
| V41 | passed | 17 | 0 | 0 / 16 | no | 1 / 16 | yes |

- Y1 informative videos: V06, V08, V15 (as metrics §1.4 lists).
- Y2 informative videos: V04, V06, V08, V15, V19, V41 (as metrics §1.4 lists).
- Learned table: not run: 4/10 videos with fits.

## Ranking (content groups)

Each cell: macro mean [95% interval] (n videos where the metric is defined, of the informative videos); worst error is a sum over videos.

### Y1

| Table | Pair order | Top-1 | First-positive rank | Negatives above | MRR | Worst error (sum) |
| --- | --- | --- | --- | --- | --- | --- |
| aiosubtitles | 0.623 [0.250, 0.962] (n 3 of 3) | 1.000 [1.000, 1.000] (n 3 of 3) | 1.000 [1.000, 1.000] (n 3 of 3) | 0.000 [0.000, 0.000] (n 3 of 3) | 1.000 [1.000, 1.000] (n 3 of 3) | 0.000 [0.000, 0.000] (n 3 of 3) |
| orion | 0.629 [0.250, 0.962] (n 3 of 3) | 0.667 [0.000, 1.000] (n 3 of 3) | 1.500 [1.000, 2.500] (n 3 of 3) | 0.500 [0.000, 1.500] (n 3 of 3) | 0.806 [0.417, 1.000] (n 3 of 3) | 1.000 [0.000, 3.000] (n 3 of 3) |
| lyra | 0.551 [0.125, 0.865] (n 3 of 3) | 0.289 [0.200, 0.333] (n 3 of 3) | 2.444 [2.000, 3.000] (n 3 of 3) | 1.111 [1.000, 1.333] (n 3 of 3) | 0.549 [0.457, 0.611] (n 3 of 3) | 1.733 [1.200, 2.000] (n 3 of 3) |
| vega | 0.635 [0.250, 0.962] (n 3 of 3) | 0.833 [0.500, 1.000] (n 3 of 3) | 1.222 [1.000, 1.667] (n 3 of 3) | 0.222 [0.000, 0.667] (n 3 of 3) | 0.907 [0.722, 1.000] (n 3 of 3) | 0.500 [0.000, 1.500] (n 3 of 3) |
| subliminal | 0.583 [0.125, 0.962] (n 3 of 3) | 0.556 [0.333, 1.000] (n 3 of 3) | 1.778 [1.000, 2.333] (n 3 of 3) | 0.778 [0.000, 1.333] (n 3 of 3) | 0.730 [0.580, 1.000] (n 3 of 3) | 1.333 [0.000, 2.000] (n 3 of 3) |
| bazarr | 0.551 [0.125, 0.865] (n 3 of 3) | 0.289 [0.200, 0.333] (n 3 of 3) | 2.444 [2.000, 3.000] (n 3 of 3) | 1.111 [1.000, 1.333] (n 3 of 3) | 0.549 [0.457, 0.611] (n 3 of 3) | 1.733 [1.200, 2.000] (n 3 of 3) |
| strict-priority | 0.583 [0.125, 0.962] (n 3 of 3) | 0.556 [0.333, 1.000] (n 3 of 3) | 1.778 [1.000, 2.333] (n 3 of 3) | 0.778 [0.000, 1.333] (n 3 of 3) | 0.730 [0.580, 1.000] (n 3 of 3) | 1.333 [0.000, 2.000] (n 3 of 3) |
| orion served order | 0.633 [0.250, 0.846] (n 3 of 3) | 0.333 [0.000, 1.000] (n 3 of 3) | 1.667 [1.000, 2.000] (n 3 of 3) | 0.667 [0.000, 1.000] (n 3 of 3) | 0.667 [0.500, 1.000] (n 3 of 3) | 2.000 [0.000, 3.000] (n 3 of 3) |
| aiosubtitles + post-download | 0.615 [0.250, 0.923] (n 3 of 3) | 1.000 [1.000, 1.000] (n 3 of 3) | 1.000 [1.000, 1.000] (n 3 of 3) | 0.000 [0.000, 0.000] (n 3 of 3) | 1.000 [1.000, 1.000] (n 3 of 3) | 0.000 [0.000, 0.000] (n 3 of 3) |

Per-video Y1, Pair order:

| Table | V06 | V08 | V15 |
| --- | --- | --- | --- |
| aiosubtitles | 0.962 | 0.250 | 0.656 |
| orion | 0.962 | 0.250 | 0.674 |
| lyra | 0.865 | 0.125 | 0.664 |
| vega | 0.962 | 0.250 | 0.692 |
| subliminal | 0.962 | 0.125 | 0.664 |
| bazarr | 0.865 | 0.125 | 0.664 |
| strict-priority | 0.962 | 0.125 | 0.664 |
| orion served order | 0.846 | 0.250 | 0.804 |
| aiosubtitles + post-download | 0.923 | 0.250 | 0.671 |

Per-video Y1, Top-1:

| Table | V06 | V08 | V15 |
| --- | --- | --- | --- |
| aiosubtitles | 1.000 | 1.000 | 1.000 |
| orion | 1.000 | 1.000 | 0.000 |
| lyra | 0.200 | 0.333 | 0.333 |
| vega | 1.000 | 1.000 | 0.500 |
| subliminal | 1.000 | 0.333 | 0.333 |
| bazarr | 0.200 | 0.333 | 0.333 |
| strict-priority | 1.000 | 0.333 | 0.333 |
| orion served order | 0.000 | 1.000 | 0.000 |
| aiosubtitles + post-download | 1.000 | 1.000 | 1.000 |

Per-video Y1, First-positive rank:

| Table | V06 | V08 | V15 |
| --- | --- | --- | --- |
| aiosubtitles | 1.000 | 1.000 | 1.000 |
| orion | 1.000 | 1.000 | 2.500 |
| lyra | 3.000 | 2.000 | 2.333 |
| vega | 1.000 | 1.000 | 1.667 |
| subliminal | 1.000 | 2.000 | 2.333 |
| bazarr | 3.000 | 2.000 | 2.333 |
| strict-priority | 1.000 | 2.000 | 2.333 |
| orion served order | 2.000 | 1.000 | 2.000 |
| aiosubtitles + post-download | 1.000 | 1.000 | 1.000 |

Per-video Y1, Negatives above:

| Table | V06 | V08 | V15 |
| --- | --- | --- | --- |
| aiosubtitles | 0.000 | 0.000 | 0.000 |
| orion | 0.000 | 0.000 | 1.500 |
| lyra | 1.000 | 1.000 | 1.333 |
| vega | 0.000 | 0.000 | 0.667 |
| subliminal | 0.000 | 1.000 | 1.333 |
| bazarr | 1.000 | 1.000 | 1.333 |
| strict-priority | 0.000 | 1.000 | 1.333 |
| orion served order | 1.000 | 0.000 | 1.000 |
| aiosubtitles + post-download | 0.000 | 0.000 | 0.000 |

Per-video Y1, MRR:

| Table | V06 | V08 | V15 |
| --- | --- | --- | --- |
| aiosubtitles | 1.000 | 1.000 | 1.000 |
| orion | 1.000 | 1.000 | 0.417 |
| lyra | 0.457 | 0.611 | 0.580 |
| vega | 1.000 | 1.000 | 0.722 |
| subliminal | 1.000 | 0.611 | 0.580 |
| bazarr | 0.457 | 0.611 | 0.580 |
| strict-priority | 1.000 | 0.611 | 0.580 |
| orion served order | 0.500 | 1.000 | 0.500 |
| aiosubtitles + post-download | 1.000 | 1.000 | 1.000 |

Per-video Y1, Worst error (sum):

| Table | V06 | V08 | V15 |
| --- | --- | --- | --- |
| aiosubtitles | 0.000 | 0.000 | 0.000 |
| orion | 0.000 | 0.000 | 1.000 |
| lyra | 0.400 | 0.667 | 0.667 |
| vega | 0.000 | 0.000 | 0.500 |
| subliminal | 0.000 | 0.667 | 0.667 |
| bazarr | 0.400 | 0.667 | 0.667 |
| strict-priority | 0.000 | 0.667 | 0.667 |
| orion served order | 1.000 | 0.000 | 1.000 |
| aiosubtitles + post-download | 0.000 | 0.000 | 0.000 |

- aiosubtitles: worst-error videos none; dropped positives 4 (V08, V15); invalid rows above the best positive 1 (V15).
- orion: worst-error videos V15; dropped positives 4 (V08, V15); invalid rows above the best positive 0 (none).
- lyra: worst-error videos V06, V08, V15; dropped positives 4 (V08, V15); invalid rows above the best positive 1.5 (V15).
- vega: worst-error videos V15; dropped positives 4 (V08, V15); invalid rows above the best positive 1 (V15).
- subliminal: worst-error videos V08, V15; dropped positives 4 (V08, V15); invalid rows above the best positive 1.5 (V15).
- bazarr: worst-error videos V06, V08, V15; dropped positives 4 (V08, V15); invalid rows above the best positive 1.5 (V15).
- strict-priority: worst-error videos V08, V15; dropped positives 4 (V08, V15); invalid rows above the best positive 1.5 (V15).
- orion served order: worst-error videos V06, V15; dropped positives 0 (none); invalid rows above the best positive 0 (none).
- aiosubtitles + post-download: worst-error videos none; dropped positives 4 (V08, V15); invalid rows above the best positive 0 (none).

### Y2

| Table | Pair order | Top-1 | First-positive rank | Negatives above | MRR | Worst error (sum) |
| --- | --- | --- | --- | --- | --- | --- |
| aiosubtitles | 0.628 [0.449, 0.796] (n 6 of 6) | 0.583 [0.250, 0.917] (n 6 of 6) | 6.056 [1.083, 12.500] (n 6 of 6) | 3.556 [0.083, 9.250] (n 6 of 6) | 0.649 [0.334, 0.958] (n 6 of 6) | 1.500 [0.000, 3.500] (n 6 of 6) |
| orion | 0.627 [0.461, 0.749] (n 6 of 6) | 0.333 [0.000, 0.667] (n 6 of 6) | 5.417 [2.000, 9.500] (n 6 of 6) | 3.083 [0.333, 6.833] (n 6 of 6) | 0.467 [0.167, 0.767] (n 6 of 6) | 3.000 [1.000, 5.000] (n 6 of 6) |
| lyra | 0.562 [0.378, 0.690] (n 6 of 6) | 0.211 [0.056, 0.411] (n 6 of 6) | 8.028 [2.389, 13.889] (n 6 of 6) | 5.306 [1.389, 10.167] (n 6 of 6) | 0.387 [0.174, 0.606] (n 6 of 6) | 3.733 [2.000, 5.333] (n 6 of 6) |
| vega | 0.614 [0.455, 0.724] (n 6 of 6) | 0.417 [0.083, 0.750] (n 6 of 6) | 5.278 [2.028, 9.333] (n 6 of 6) | 2.694 [0.694, 4.861] (n 6 of 6) | 0.513 [0.214, 0.846] (n 6 of 6) | 2.500 [0.500, 4.500] (n 6 of 6) |
| subliminal | 0.565 [0.380, 0.693] (n 6 of 6) | 0.278 [0.056, 0.611] (n 6 of 6) | 7.944 [2.222, 13.889] (n 6 of 6) | 5.222 [1.222, 10.167] (n 6 of 6) | 0.423 [0.174, 0.710] (n 6 of 6) | 3.333 [1.333, 5.333] (n 6 of 6) |
| bazarr | 0.560 [0.377, 0.689] (n 6 of 6) | 0.211 [0.056, 0.411] (n 6 of 6) | 7.917 [2.389, 13.556] (n 6 of 6) | 5.306 [1.389, 10.167] (n 6 of 6) | 0.387 [0.176, 0.606] (n 6 of 6) | 3.733 [2.000, 5.333] (n 6 of 6) |
| strict-priority | 0.565 [0.380, 0.693] (n 6 of 6) | 0.278 [0.056, 0.611] (n 6 of 6) | 7.944 [2.222, 13.889] (n 6 of 6) | 5.222 [1.222, 10.167] (n 6 of 6) | 0.423 [0.174, 0.710] (n 6 of 6) | 3.333 [1.333, 5.333] (n 6 of 6) |
| orion served order | 0.651 [0.479, 0.789] (n 6 of 6) | 0.167 [0.000, 0.500] (n 6 of 6) | 5.833 [2.167, 10.500] (n 6 of 6) | 3.500 [0.333, 8.333] (n 6 of 6) | 0.397 [0.167, 0.676] (n 6 of 6) | 4.000 [2.000, 6.000] (n 6 of 6) |
| aiosubtitles + post-download | 0.640 [0.458, 0.809] (n 6 of 6) | 0.583 [0.250, 0.917] (n 6 of 6) | 3.500 [1.083, 6.000] (n 6 of 6) | 1.333 [0.000, 3.833] (n 6 of 6) | 0.666 [0.372, 0.958] (n 6 of 6) | 1.500 [0.000, 3.500] (n 6 of 6) |

Per-video Y2, Pair order:

| Table | V04 | V06 | V08 | V15 | V19 | V41 |
| --- | --- | --- | --- | --- | --- | --- |
| aiosubtitles | 0.647 | 0.650 | 0.250 | 0.569 | 0.684 | 0.969 |
| orion | 0.802 | 0.619 | 0.250 | 0.598 | 0.772 | 0.719 |
| lyra | 0.552 | 0.658 | 0.125 | 0.602 | 0.684 | 0.750 |
| vega | 0.690 | 0.631 | 0.250 | 0.658 | 0.798 | 0.656 |
| subliminal | 0.552 | 0.677 | 0.125 | 0.602 | 0.684 | 0.750 |
| bazarr | 0.552 | 0.650 | 0.125 | 0.602 | 0.684 | 0.750 |
| strict-priority | 0.552 | 0.677 | 0.125 | 0.602 | 0.684 | 0.750 |
| orion served order | 0.879 | 0.600 | 0.250 | 0.657 | 0.772 | 0.750 |
| aiosubtitles + post-download | 0.672 | 0.619 | 0.250 | 0.558 | 0.768 | 0.969 |

Per-video Y2, Top-1:

| Table | V04 | V06 | V08 | V15 | V19 | V41 |
| --- | --- | --- | --- | --- | --- | --- |
| aiosubtitles | 0.000 | 1.000 | 1.000 | 1.000 | 0.000 | 0.500 |
| orion | 0.000 | 1.000 | 1.000 | 0.000 | 0.000 | 0.000 |
| lyra | 0.000 | 0.600 | 0.333 | 0.333 | 0.000 | 0.000 |
| vega | 0.000 | 1.000 | 1.000 | 0.500 | 0.000 | 0.000 |
| subliminal | 0.000 | 1.000 | 0.333 | 0.333 | 0.000 | 0.000 |
| bazarr | 0.000 | 0.600 | 0.333 | 0.333 | 0.000 | 0.000 |
| strict-priority | 0.000 | 1.000 | 0.333 | 0.333 | 0.000 | 0.000 |
| orion served order | 0.000 | 0.000 | 1.000 | 0.000 | 0.000 | 0.000 |
| aiosubtitles + post-download | 0.000 | 1.000 | 1.000 | 1.000 | 0.000 | 0.500 |

Per-video Y2, First-positive rank:

| Table | V04 | V06 | V08 | V15 | V19 | V41 |
| --- | --- | --- | --- | --- | --- | --- |
| aiosubtitles | 11.500 | 1.000 | 1.000 | 1.000 | 20.333 | 1.500 |
| orion | 8.500 | 1.000 | 1.000 | 2.500 | 14.000 | 5.500 |
| lyra | 19.333 | 1.500 | 2.000 | 2.333 | 18.000 | 5.000 |
| vega | 13.500 | 1.000 | 1.000 | 1.667 | 8.000 | 6.500 |
| subliminal | 19.333 | 1.000 | 2.000 | 2.333 | 18.000 | 5.000 |
| bazarr | 18.667 | 1.500 | 2.000 | 2.333 | 18.000 | 5.000 |
| strict-priority | 19.333 | 1.000 | 2.000 | 2.333 | 18.000 | 5.000 |
| orion served order | 8.000 | 2.000 | 1.000 | 2.000 | 17.000 | 5.000 |
| aiosubtitles + post-download | 8.000 | 1.000 | 1.000 | 1.000 | 8.500 | 1.500 |

Per-video Y2, Negatives above:

| Table | V04 | V06 | V08 | V15 | V19 | V41 |
| --- | --- | --- | --- | --- | --- | --- |
| aiosubtitles | 3.500 | 0.000 | 0.000 | 0.000 | 17.333 | 0.500 |
| orion | 0.500 | 0.000 | 0.000 | 1.500 | 12.000 | 4.500 |
| lyra | 8.667 | 0.500 | 1.000 | 1.333 | 16.333 | 4.000 |
| vega | 3.500 | 0.000 | 0.000 | 0.667 | 6.500 | 5.500 |
| subliminal | 8.667 | 0.000 | 1.000 | 1.333 | 16.333 | 4.000 |
| bazarr | 8.667 | 0.500 | 1.000 | 1.333 | 16.333 | 4.000 |
| strict-priority | 8.667 | 0.000 | 1.000 | 1.333 | 16.333 | 4.000 |
| orion served order | 0.000 | 1.000 | 0.000 | 1.000 | 15.000 | 4.000 |
| aiosubtitles + post-download | 0.000 | 0.000 | 0.000 | 0.000 | 7.500 | 0.500 |

Per-video Y2, MRR:

| Table | V04 | V06 | V08 | V15 | V19 | V41 |
| --- | --- | --- | --- | --- | --- | --- |
| aiosubtitles | 0.091 | 1.000 | 1.000 | 1.000 | 0.054 | 0.750 |
| orion | 0.118 | 1.000 | 1.000 | 0.417 | 0.082 | 0.183 |
| lyra | 0.059 | 0.783 | 0.611 | 0.580 | 0.069 | 0.219 |
| vega | 0.076 | 1.000 | 1.000 | 0.722 | 0.126 | 0.155 |
| subliminal | 0.059 | 1.000 | 0.611 | 0.580 | 0.069 | 0.219 |
| bazarr | 0.062 | 0.783 | 0.611 | 0.580 | 0.069 | 0.219 |
| strict-priority | 0.059 | 1.000 | 0.611 | 0.580 | 0.069 | 0.219 |
| orion served order | 0.125 | 0.500 | 1.000 | 0.500 | 0.059 | 0.200 |
| aiosubtitles + post-download | 0.125 | 1.000 | 1.000 | 1.000 | 0.120 | 0.750 |

Per-video Y2, Worst error (sum):

| Table | V04 | V06 | V08 | V15 | V19 | V41 |
| --- | --- | --- | --- | --- | --- | --- |
| aiosubtitles | 0.000 | 0.000 | 0.000 | 0.000 | 1.000 | 0.500 |
| orion | 0.000 | 0.000 | 0.000 | 1.000 | 1.000 | 1.000 |
| lyra | 0.000 | 0.400 | 0.667 | 0.667 | 1.000 | 1.000 |
| vega | 0.000 | 0.000 | 0.000 | 0.500 | 1.000 | 1.000 |
| subliminal | 0.000 | 0.000 | 0.667 | 0.667 | 1.000 | 1.000 |
| bazarr | 0.000 | 0.400 | 0.667 | 0.667 | 1.000 | 1.000 |
| strict-priority | 0.000 | 0.000 | 0.667 | 0.667 | 1.000 | 1.000 |
| orion served order | 0.000 | 1.000 | 0.000 | 1.000 | 1.000 | 1.000 |
| aiosubtitles + post-download | 0.000 | 0.000 | 0.000 | 0.000 | 1.000 | 0.500 |

- aiosubtitles: worst-error videos V19, V41; dropped positives 6 (V06, V08, V15); invalid rows above the best positive 4 (V04, V15, V19).
- orion: worst-error videos V15, V19, V41; dropped positives 6 (V06, V08, V15); invalid rows above the best positive 2.5 (V04, V19).
- lyra: worst-error videos V06, V08, V15, V19, V41; dropped positives 6 (V06, V08, V15); invalid rows above the best positive 18 (V04, V15, V19).
- vega: worst-error videos V15, V19, V41; dropped positives 6 (V06, V08, V15); invalid rows above the best positive 3 (V04, V15, V19).
- subliminal: worst-error videos V08, V15, V19, V41; dropped positives 6 (V06, V08, V15); invalid rows above the best positive 18 (V04, V15, V19).
- bazarr: worst-error videos V06, V08, V15, V19, V41; dropped positives 6 (V06, V08, V15); invalid rows above the best positive 18 (V04, V15, V19).
- strict-priority: worst-error videos V08, V15, V19, V41; dropped positives 6 (V06, V08, V15); invalid rows above the best positive 18 (V04, V15, V19).
- orion served order: worst-error videos V06, V15, V19, V41; dropped positives 0 (none); invalid rows above the best positive 1 (V19).
- aiosubtitles + post-download: worst-error videos V19, V41; dropped positives 6 (V06, V08, V15); invalid rows above the best positive 0 (none).

## Win/tie matrices (pair order)

A row beats a column only when the 95% interval of the paired difference is above 0. With 3 videos, the worst video drawn three times weighs 1/27 > 0.025, so a table wins only when it is better on every video and most comparisons are ties. The secondary run is not compared.

### Y1

| Row vs column | aiosubtitles | orion | lyra | vega | subliminal | bazarr | strict-priority | orion served order |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| aiosubtitles | — | tie | tie | tie | tie | tie | tie | tie |
| orion | tie | — | win | tie | tie | win | tie | tie |
| lyra | tie | loss | — | loss | tie | tie | tie | tie |
| vega | tie | tie | win | — | tie | win | tie | tie |
| subliminal | tie | tie | tie | tie | — | tie | tie | tie |
| bazarr | tie | loss | tie | loss | tie | — | tie | tie |
| strict-priority | tie | tie | tie | tie | tie | tie | — | tie |
| orion served order | tie | tie | tie | tie | tie | tie | tie | — |

- Not beaten: aiosubtitles, orion, vega, subliminal, strict-priority, orion served order.

### Y2

| Row vs column | aiosubtitles | orion | lyra | vega | subliminal | bazarr | strict-priority | orion served order |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| aiosubtitles | — | tie | win | tie | tie | win | tie | tie |
| orion | tie | — | tie | tie | tie | tie | tie | tie |
| lyra | loss | tie | — | tie | tie | tie | tie | loss |
| vega | tie | tie | tie | — | tie | tie | tie | tie |
| subliminal | tie | tie | tie | tie | — | tie | tie | tie |
| bazarr | loss | tie | tie | tie | tie | — | tie | loss |
| strict-priority | tie | tie | tie | tie | tie | tie | — | tie |
| orion served order | tie | tie | win | tie | tie | win | tie | — |

- Not beaten: aiosubtitles, orion, vega, subliminal, strict-priority, orion served order.

## Passed-audit-only sensitivity (no decision)

### Y1, videos whose truth audit passed

| Table | Pair order | Top-1 | First-positive rank | Negatives above | MRR | Worst error (sum) |
| --- | --- | --- | --- | --- | --- | --- |
| aiosubtitles | 0.250 [0.250, 0.250] (n 1 of 1) | 1.000 [1.000, 1.000] (n 1 of 1) | 1.000 [1.000, 1.000] (n 1 of 1) | 0.000 [0.000, 0.000] (n 1 of 1) | 1.000 [1.000, 1.000] (n 1 of 1) | 0.000 [0.000, 0.000] (n 1 of 1) |
| orion | 0.250 [0.250, 0.250] (n 1 of 1) | 1.000 [1.000, 1.000] (n 1 of 1) | 1.000 [1.000, 1.000] (n 1 of 1) | 0.000 [0.000, 0.000] (n 1 of 1) | 1.000 [1.000, 1.000] (n 1 of 1) | 0.000 [0.000, 0.000] (n 1 of 1) |
| lyra | 0.125 [0.125, 0.125] (n 1 of 1) | 0.333 [0.333, 0.333] (n 1 of 1) | 2.000 [2.000, 2.000] (n 1 of 1) | 1.000 [1.000, 1.000] (n 1 of 1) | 0.611 [0.611, 0.611] (n 1 of 1) | 0.667 [0.667, 0.667] (n 1 of 1) |
| vega | 0.250 [0.250, 0.250] (n 1 of 1) | 1.000 [1.000, 1.000] (n 1 of 1) | 1.000 [1.000, 1.000] (n 1 of 1) | 0.000 [0.000, 0.000] (n 1 of 1) | 1.000 [1.000, 1.000] (n 1 of 1) | 0.000 [0.000, 0.000] (n 1 of 1) |
| subliminal | 0.125 [0.125, 0.125] (n 1 of 1) | 0.333 [0.333, 0.333] (n 1 of 1) | 2.000 [2.000, 2.000] (n 1 of 1) | 1.000 [1.000, 1.000] (n 1 of 1) | 0.611 [0.611, 0.611] (n 1 of 1) | 0.667 [0.667, 0.667] (n 1 of 1) |
| bazarr | 0.125 [0.125, 0.125] (n 1 of 1) | 0.333 [0.333, 0.333] (n 1 of 1) | 2.000 [2.000, 2.000] (n 1 of 1) | 1.000 [1.000, 1.000] (n 1 of 1) | 0.611 [0.611, 0.611] (n 1 of 1) | 0.667 [0.667, 0.667] (n 1 of 1) |
| strict-priority | 0.125 [0.125, 0.125] (n 1 of 1) | 0.333 [0.333, 0.333] (n 1 of 1) | 2.000 [2.000, 2.000] (n 1 of 1) | 1.000 [1.000, 1.000] (n 1 of 1) | 0.611 [0.611, 0.611] (n 1 of 1) | 0.667 [0.667, 0.667] (n 1 of 1) |
| orion served order | 0.250 [0.250, 0.250] (n 1 of 1) | 1.000 [1.000, 1.000] (n 1 of 1) | 1.000 [1.000, 1.000] (n 1 of 1) | 0.000 [0.000, 0.000] (n 1 of 1) | 1.000 [1.000, 1.000] (n 1 of 1) | 0.000 [0.000, 0.000] (n 1 of 1) |
| aiosubtitles + post-download | 0.250 [0.250, 0.250] (n 1 of 1) | 1.000 [1.000, 1.000] (n 1 of 1) | 1.000 [1.000, 1.000] (n 1 of 1) | 0.000 [0.000, 0.000] (n 1 of 1) | 1.000 [1.000, 1.000] (n 1 of 1) | 0.000 [0.000, 0.000] (n 1 of 1) |

### Y2, videos whose truth audit passed

| Table | Pair order | Top-1 | First-positive rank | Negatives above | MRR | Worst error (sum) |
| --- | --- | --- | --- | --- | --- | --- |
| aiosubtitles | 0.622 [0.250, 0.969] (n 3 of 3) | 0.500 [0.000, 1.000] (n 3 of 3) | 4.667 [1.000, 11.500] (n 3 of 3) | 1.333 [0.000, 3.500] (n 3 of 3) | 0.614 [0.091, 1.000] (n 3 of 3) | 0.500 [0.000, 1.500] (n 3 of 3) |
| orion | 0.590 [0.250, 0.802] (n 3 of 3) | 0.333 [0.000, 1.000] (n 3 of 3) | 5.000 [1.000, 8.500] (n 3 of 3) | 1.667 [0.000, 4.500] (n 3 of 3) | 0.434 [0.118, 1.000] (n 3 of 3) | 1.000 [0.000, 3.000] (n 3 of 3) |
| lyra | 0.476 [0.125, 0.750] (n 3 of 3) | 0.111 [0.000, 0.333] (n 3 of 3) | 8.778 [2.000, 19.333] (n 3 of 3) | 4.556 [1.000, 8.667] (n 3 of 3) | 0.296 [0.059, 0.611] (n 3 of 3) | 1.667 [0.000, 3.000] (n 3 of 3) |
| vega | 0.532 [0.250, 0.690] (n 3 of 3) | 0.333 [0.000, 1.000] (n 3 of 3) | 7.000 [1.000, 13.500] (n 3 of 3) | 3.000 [0.000, 5.500] (n 3 of 3) | 0.410 [0.076, 1.000] (n 3 of 3) | 1.000 [0.000, 3.000] (n 3 of 3) |
| subliminal | 0.476 [0.125, 0.750] (n 3 of 3) | 0.111 [0.000, 0.333] (n 3 of 3) | 8.778 [2.000, 19.333] (n 3 of 3) | 4.556 [1.000, 8.667] (n 3 of 3) | 0.296 [0.059, 0.611] (n 3 of 3) | 1.667 [0.000, 3.000] (n 3 of 3) |
| bazarr | 0.476 [0.125, 0.750] (n 3 of 3) | 0.111 [0.000, 0.333] (n 3 of 3) | 8.556 [2.000, 18.667] (n 3 of 3) | 4.556 [1.000, 8.667] (n 3 of 3) | 0.297 [0.062, 0.611] (n 3 of 3) | 1.667 [0.000, 3.000] (n 3 of 3) |
| strict-priority | 0.476 [0.125, 0.750] (n 3 of 3) | 0.111 [0.000, 0.333] (n 3 of 3) | 8.778 [2.000, 19.333] (n 3 of 3) | 4.556 [1.000, 8.667] (n 3 of 3) | 0.296 [0.059, 0.611] (n 3 of 3) | 1.667 [0.000, 3.000] (n 3 of 3) |
| orion served order | 0.626 [0.250, 0.879] (n 3 of 3) | 0.333 [0.000, 1.000] (n 3 of 3) | 4.667 [1.000, 8.000] (n 3 of 3) | 1.333 [0.000, 4.000] (n 3 of 3) | 0.442 [0.125, 1.000] (n 3 of 3) | 1.000 [0.000, 3.000] (n 3 of 3) |
| aiosubtitles + post-download | 0.630 [0.250, 0.969] (n 3 of 3) | 0.500 [0.000, 1.000] (n 3 of 3) | 3.500 [1.000, 8.000] (n 3 of 3) | 0.167 [0.000, 0.500] (n 3 of 3) | 0.625 [0.125, 1.000] (n 3 of 3) | 0.500 [0.000, 1.500] (n 3 of 3) |

## Row-level view (descriptive, no decision)

### Y1 rows

| Table | Pair order | Top-1 | First-positive rank | Negatives above | MRR | Worst error (sum) |
| --- | --- | --- | --- | --- | --- | --- |
| aiosubtitles | 0.515 [0.167, 0.689] (n 3 of 3) | 1.000 [1.000, 1.000] (n 3 of 3) | 1.000 [1.000, 1.000] (n 3 of 3) | 0.000 [0.000, 0.000] (n 3 of 3) | 1.000 [1.000, 1.000] (n 3 of 3) | 0.000 [0.000, 0.000] (n 3 of 3) |
| orion | 0.456 [0.167, 0.616] (n 3 of 3) | 0.667 [0.000, 1.000] (n 3 of 3) | 1.500 [1.000, 2.500] (n 3 of 3) | 0.500 [0.000, 1.500] (n 3 of 3) | 0.806 [0.417, 1.000] (n 3 of 3) | 1.000 [0.000, 3.000] (n 3 of 3) |
| lyra | 0.467 [0.083, 0.676] (n 3 of 3) | 0.363 [0.200, 0.556] (n 3 of 3) | 2.444 [1.667, 3.667] (n 3 of 3) | 0.889 [0.667, 1.000] (n 3 of 3) | 0.595 [0.429, 0.746] (n 3 of 3) | 1.411 [0.900, 2.000] (n 3 of 3) |
| vega | 0.516 [0.167, 0.695] (n 3 of 3) | 0.867 [0.600, 1.000] (n 3 of 3) | 1.167 [1.000, 1.500] (n 3 of 3) | 0.167 [0.000, 0.500] (n 3 of 3) | 0.928 [0.783, 1.000] (n 3 of 3) | 0.400 [0.000, 1.200] (n 3 of 3) |
| subliminal | 0.483 [0.083, 0.689] (n 3 of 3) | 0.630 [0.333, 1.000] (n 3 of 3) | 1.556 [1.000, 2.000] (n 3 of 3) | 0.556 [0.000, 1.000] (n 3 of 3) | 0.786 [0.611, 1.000] (n 3 of 3) | 1.111 [0.000, 2.000] (n 3 of 3) |
| bazarr | 0.467 [0.083, 0.676] (n 3 of 3) | 0.363 [0.200, 0.556] (n 3 of 3) | 2.444 [1.667, 3.667] (n 3 of 3) | 0.889 [0.667, 1.000] (n 3 of 3) | 0.595 [0.429, 0.746] (n 3 of 3) | 1.411 [0.900, 2.000] (n 3 of 3) |
| strict-priority | 0.483 [0.083, 0.689] (n 3 of 3) | 0.630 [0.333, 1.000] (n 3 of 3) | 1.556 [1.000, 2.000] (n 3 of 3) | 0.556 [0.000, 1.000] (n 3 of 3) | 0.786 [0.611, 1.000] (n 3 of 3) | 1.111 [0.000, 2.000] (n 3 of 3) |
| orion served order | 0.522 [0.167, 0.746] (n 3 of 3) | 0.333 [0.000, 1.000] (n 3 of 3) | 2.333 [1.000, 4.000] (n 3 of 3) | 1.333 [0.000, 3.000] (n 3 of 3) | 0.583 [0.250, 1.000] (n 3 of 3) | 2.000 [0.000, 3.000] (n 3 of 3) |
| aiosubtitles + post-download | 0.506 [0.167, 0.699] (n 3 of 3) | 1.000 [1.000, 1.000] (n 3 of 3) | 1.000 [1.000, 1.000] (n 3 of 3) | 0.000 [0.000, 0.000] (n 3 of 3) | 1.000 [1.000, 1.000] (n 3 of 3) | 0.000 [0.000, 0.000] (n 3 of 3) |

### Y2 rows

| Table | Pair order | Top-1 | First-positive rank | Negatives above | MRR | Worst error (sum) |
| --- | --- | --- | --- | --- | --- | --- |
| aiosubtitles | 0.575 [0.390, 0.742] (n 6 of 6) | 0.583 [0.250, 0.917] (n 6 of 6) | 7.417 [1.083, 15.750] (n 6 of 6) | 4.250 [0.083, 11.833] (n 6 of 6) | 0.644 [0.324, 0.958] (n 6 of 6) | 1.500 [0.000, 3.500] (n 6 of 6) |
| orion | 0.532 [0.373, 0.646] (n 6 of 6) | 0.333 [0.000, 0.667] (n 6 of 6) | 6.444 [2.167, 10.972] (n 6 of 6) | 3.444 [0.306, 7.639] (n 6 of 6) | 0.454 [0.147, 0.762] (n 6 of 6) | 3.000 [1.000, 5.000] (n 6 of 6) |
| lyra | 0.532 [0.341, 0.676] (n 6 of 6) | 0.265 [0.056, 0.498] (n 6 of 6) | 9.204 [2.147, 16.586] (n 6 of 6) | 5.593 [1.147, 12.378] (n 6 of 6) | 0.421 [0.173, 0.676] (n 6 of 6) | 3.411 [1.644, 5.111] (n 6 of 6) |
| vega | 0.547 [0.385, 0.661] (n 6 of 6) | 0.433 [0.100, 0.800] (n 6 of 6) | 7.056 [2.139, 12.806] (n 6 of 6) | 3.639 [0.667, 7.389] (n 6 of 6) | 0.509 [0.198, 0.842] (n 6 of 6) | 2.400 [0.400, 4.400] (n 6 of 6) |
| subliminal | 0.534 [0.342, 0.679] (n 6 of 6) | 0.315 [0.056, 0.648] (n 6 of 6) | 9.141 [2.022, 16.586] (n 6 of 6) | 5.530 [1.022, 12.378] (n 6 of 6) | 0.448 [0.173, 0.743] (n 6 of 6) | 3.111 [1.111, 5.111] (n 6 of 6) |
| bazarr | 0.531 [0.339, 0.676] (n 6 of 6) | 0.265 [0.056, 0.498] (n 6 of 6) | 8.870 [2.147, 16.252] (n 6 of 6) | 5.593 [1.147, 12.378] (n 6 of 6) | 0.422 [0.174, 0.676] (n 6 of 6) | 3.411 [1.644, 5.111] (n 6 of 6) |
| strict-priority | 0.534 [0.342, 0.679] (n 6 of 6) | 0.315 [0.056, 0.648] (n 6 of 6) | 9.141 [2.022, 16.586] (n 6 of 6) | 5.530 [1.022, 12.378] (n 6 of 6) | 0.448 [0.173, 0.743] (n 6 of 6) | 3.111 [1.111, 5.111] (n 6 of 6) |
| orion served order | 0.556 [0.385, 0.681] (n 6 of 6) | 0.167 [0.000, 0.500] (n 6 of 6) | 7.667 [2.833, 13.667] (n 6 of 6) | 4.667 [0.667, 10.667] (n 6 of 6) | 0.341 [0.119, 0.625] (n 6 of 6) | 4.000 [2.000, 6.000] (n 6 of 6) |
| aiosubtitles + post-download | 0.592 [0.399, 0.762] (n 6 of 6) | 0.583 [0.250, 0.917] (n 6 of 6) | 5.083 [1.083, 9.417] (n 6 of 6) | 2.250 [0.000, 6.583] (n 6 of 6) | 0.651 [0.342, 0.958] (n 6 of 6) | 1.500 [0.000, 3.500] (n 6 of 6) |

## Deduplication

### D1: tier 1-2 recall without download

- Pair recall: total 0.000 (0/311), same site 0.000 (0/22), cross-site 0.000 (0/289).
- Row reduction: 0.000.
- False merges: 0 (none).
- tier 2: not measurable (the corpus has no alias data).
- D1 recall is expected near 0: every valid pool row has a distinct site id, because Orion already merged same-id rows. This number describes the corpus, not the method.

### D2: tier-3 key agreement

- Micro: precision 0.951, recall 0.997 (310 agreed, 326 equal keys, 311 same content).
- Macro: precision 0.957 (defined in 12 of 12), recall 0.996 (defined in 12 of 12).
- Cross-class equal keys: 0. Byte-identical pairs split: 0.
- E16: precision 0.667, recall 1.000, cross-class 0, byte-identical split 0.
- E17: precision 1.000, recall 1.000, cross-class 0, byte-identical split 0.
- V01: precision 1.000, recall 1.000, cross-class 0, byte-identical split 0.
- V04: precision 0.818, recall 1.000, cross-class 0, byte-identical split 0.
- V06: precision 1.000, recall 1.000, cross-class 0, byte-identical split 0.
- V08: precision 1.000, recall 1.000, cross-class 0, byte-identical split 0.
- V13: precision 1.000, recall 1.000, cross-class 0, byte-identical split 0.
- V15: precision 1.000, recall 1.000, cross-class 0, byte-identical split 0.
- V19: precision 1.000, recall 1.000, cross-class 0, byte-identical split 0.
- V21: precision 1.000, recall 1.000, cross-class 0, byte-identical split 0.
- V25: precision 1.000, recall 1.000, cross-class 0, byte-identical split 0.
- V41: precision 1.000, recall 0.955, cross-class 0, byte-identical split 0.

### D3: tier-4 threshold rule

- Time-equal group pairs: 72; cross-class among them: 0; highest cross-class similarity: —; τ 0.9.
- Merges at τ: cross-class 0, same-class 72.
- E16: pairs 1, cross-class 0, cross-class merges 0, same-class merges 1.
- E17: pairs 1, cross-class 0, cross-class merges 0, same-class merges 1.
- V04: pairs 9, cross-class 0, cross-class merges 0, same-class merges 9.
- V15: pairs 51, cross-class 0, cross-class merges 0, same-class merges 51.
- V19: pairs 7, cross-class 0, cross-class merges 0, same-class merges 7.
- V25: pairs 1, cross-class 0, cross-class merges 0, same-class merges 1.
- V41: pairs 2, cross-class 0, cross-class merges 0, same-class merges 2.
- cross-class rule not testable on this corpus.
- Product duplicate grouping at τ (tiers 1-4, per language): 535 rows in 274 groups; the secondary run reads its copy count from these groups.
- Rows without a parsable site id: 0. Two such rows of one source would merge at tier 1 in the product grouping and raise the secondary copy count; D1 gives them no key.

## Time family (held-out values, leave one video out)

- T1 against Atlas time families: precision 0.927 (defined in 8 of 12), interval 0.927 [0.856, 0.981] (n 8 of 12); recall 0.868 (defined in 11 of 12), interval 0.868 [0.655, 1.000] (n 11 of 12); balanced accuracy 0.918 (defined in 9 of 12), interval 0.918 [0.804, 0.998] (n 9 of 12).
- T1 predicted-same cross-class pairs: 2 in all; per video: E16 0, E17 0, V01 0, V04 0, V06 0, V08 0, V13 0, V15 2, V19 0, V21 0, V25 0, V41 0.
- T2 with the truth track as reference: precision 1.000 (defined in 2 of 12), interval 1.000 [1.000, 1.000] (n 2 of 12); recall 0.348 (defined in 4 of 12), interval 0.348 [0.063, 0.786] (n 4 of 12).
- T1 measures agreement with Atlas’s own grouping rule, not an independent truth.

## Not run and not measurable

- Learned table: not run: 4/10 videos with fits.
- tier 2: not measurable.
- D1 recall is expected near 0: every valid pool row has a distinct site id, because Orion already merged same-id rows. This number describes the corpus, not the method.
- D3: cross-class rule not testable on this corpus.
