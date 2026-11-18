# Name-parser test (2026-11-18)

## Run

- Metrics: v1. Metrics SHA-256: 2b6bcc1b1980e3bd59ba76beef0e9e239b4094df1fdbef0bda94d844730e0d2b
- Corpus index SHA-256: 34193d0d9598dcc8fedd675d16baffac2b283770056377db234e1fc745128fbe
- Case SHA-256: E16 30e31d7193c92f1d2d0986339a39f8e91c370b5ede89ecaadde4e503fce3030e, E17 f012d944d1de398351c16c86db41322b8107ae4745b6db9a4934274a75c448a1, V01 bb1e1c2a1ae49ee7316bb75b4ee609d0bbb00b45ef57b3f97a0d8b5602a6b80c, V04 48895f4758824f36f0ff77e3e7b988ee803d434376649500b68cfb9ab6d89b21, V06 480d50a715a78b93d4116231005f102423282808ac2eeba83ec7b372628dacd2, V08 47ebcdd4b83ca01b9dbc9ec15a7a3c0dc01866ef2757368d043c326613f9cc6c, V13 f37fe85732fb169746dd32eca21f5d6d6d879b91131b8f3d1257fc295b153f82, V15 4a6c0bc467f16f5d695e6ee8c8457aa8c3ee5cb42aff3e4f7a36e184c77cac53, V19 a6bcedce17c770829220709973798728999df5d3f5b04374ae9cfc5878543dac, V41 793e74c9de9cb60b546d239a30482de90a42acae8f6fe053a6cc47ccb8a8bf6c, V21 449df0826d7011a9f1647b0d4eff25319d8d09944774674d403b725a0d4d1ea3, V25 e32c45efc136aed953c722c7eafd7f61a8cda4850ea8240a1b45d3d8cb9ce421
- Code: eval source tree d2e71406937ccb7014bacac9f0e0854f94f42bd1, subtitle-core source tree cbcec1cc600648a43bd791880e2204d764504443
- Uncommitted source changes: no
- Parsers: guessit 4.5.1 (Python dump), @aiostreams/release-parser 1.0.1, @ctrl/video-filename-parser 5.13.1, parsium-media 1.1.0
- Reference commits: guessit f337e1ace4f84eea69d6654fbb164d001f5f808b, Sonarr 51a2412af235197ce15d7d4a17c053a8e2c26609, PTT 88429bb90acef55673f421f45038878809b1e577, go-ptt d68f7eb2d535de515f3275885010d837d30a12c7
- Labels SHA-256: 974f6b596dda40d7014af1ca4d0544df246e5537d8f7f55653ea5cdbdba69065
- Own names: 389 in all; subtitle release names by the §7.2 rule: 325; video file names: 64
- External names: guessit yml 1041, Sonarr ParserTests 710, PTT and go-ptt tests 604
- Edition items dropped because one source names several canonical editions: guessit yml 2, Sonarr ParserTests 0, PTT and go-ptt tests 0
- Resampling: names sorted by SHA-256, one unit per name in a comparison scope, 10000 resamples with mulberry32 seed 20261117, exact enumeration when n ≤ 7
- video-filename-parser mode: TV mode when its TV reading finds a season, unless that season and episode spell the movie reading’s year; movie mode otherwise.
- video-filename-parser service: the library has no service field, so its service reading is always absent and it is right on own names only where no service is labelled; it also infers WEBDL for some names without a source token.
- Sonarr titles: some Sonarr title items keep the series year (“Series Title 2010”); every library that splits the year out of the title loses those items alike, so paired differences are unchanged.

## Agreed-sample check

- Pending items labelled: 627
- Agreed items sampled: 277
- Sampled labels that differ from the agreed value: 10 (3.6%)
- Labels outside the pending set, ignored: 0

## Per-field accuracy

### own names

| Library | group | source | service | edition | season | episode | title | year | Score [95% CI] | n |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| guessit | 0.730 (284/389) | 0.992 (386/389) | 0.954 (371/389) | 0.979 (381/389) | 0.997 (388/389) | 0.990 (385/389) | 0.853 (332/389) | 1.000 (389/389) | 0.937 [0.927, 0.946] | 389 |
| @aiostreams/release-parser | 0.733 (285/389) | 0.990 (385/389) | 0.987 (384/389) | 0.985 (383/389) | 0.995 (387/389) | 0.990 (385/389) | 0.859 (334/389) | 1.000 (389/389) | 0.942 [0.933, 0.950] | 389 |
| @ctrl/video-filename-parser | 0.797 (310/389) | 0.918 (357/389) | 0.879 (342/389) | 0.977 (380/389) | 0.997 (388/389) | 0.979 (381/389) | 0.817 (318/389) | 0.985 (383/389) | 0.919 [0.909, 0.928] | 389 |
| parsium-media | 0.823 (320/389) | 0.995 (387/389) | 0.997 (388/389) | 0.987 (384/389) | 0.995 (387/389) | 0.995 (387/389) | 0.843 (328/389) | 1.000 (389/389) | 0.954 [0.946, 0.962] | 389 |

Fields without items: none.

### guessit yml

| Library | group | source | service | edition | season | episode | title | year | Score [95% CI] | n |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| @aiostreams/release-parser | 0.713 (427/599) | 0.930 (531/571) | 0.594 (19/32) | 0.739 (17/23) | 0.889 (466/524) | 0.836 (494/591) | 0.742 (741/998) | 0.950 (284/299) | 0.799 [0.765, 0.832] | 1041 |
| @ctrl/video-filename-parser | 0.785 (470/599) | 0.935 (534/571) | 0.000 (0/32) | 0.478 (11/23) | 0.857 (449/524) | 0.866 (512/591) | 0.653 (652/998) | 0.742 (222/299) | 0.665 [0.636, 0.694] | 1041 |
| parsium-media | 0.788 (472/599) | 0.949 (542/571) | 0.656 (21/32) | 0.826 (19/23) | 0.844 (442/524) | 0.814 (481/591) | 0.709 (708/998) | 0.977 (292/299) | 0.820 [0.788, 0.850] | 1041 |

Fields without items: none.

### Sonarr ParserTests

| Library | group | source | service | edition | season | episode | title | year | Score [95% CI] | n |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| guessit | 0.562 (68/121) | 0.984 (186/189) | — | — | 0.902 (331/367) | 0.898 (333/371) | 0.724 (270/373) | 1.000 (18/18) | 0.845 [0.826, 0.865] | 710 |
| @aiostreams/release-parser | 0.463 (56/121) | 0.963 (182/189) | — | — | 0.877 (322/367) | 0.838 (311/371) | 0.705 (263/373) | 1.000 (18/18) | 0.808 [0.787, 0.829] | 710 |
| parsium-media | 0.860 (104/121) | 0.995 (188/189) | — | — | 0.807 (296/367) | 0.779 (289/371) | 0.759 (283/373) | 1.000 (18/18) | 0.866 [0.847, 0.886] | 710 |

Fields without items: service, edition.

### PTT and go-ptt tests

| Library | group | source | service | edition | season | episode | title | year | Score [95% CI] | n |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| guessit | 0.610 (114/187) | 0.859 (195/227) | 0.961 (172/179) | 0.988 (170/172) | 0.828 (240/290) | 0.756 (260/344) | 0.805 (207/257) | 0.927 (165/178) | 0.842 [0.823, 0.860] | 604 |
| @ctrl/video-filename-parser | 0.791 (148/187) | 0.718 (163/227) | 0.894 (160/179) | 0.971 (167/172) | 0.648 (188/290) | 0.715 (246/344) | 0.611 (157/257) | 0.820 (146/178) | 0.771 [0.749, 0.793] | 604 |
| parsium-media | 0.845 (158/187) | 0.885 (201/227) | 0.955 (171/179) | 0.988 (170/172) | 0.762 (221/290) | 0.805 (277/344) | 0.728 (187/257) | 0.944 (168/178) | 0.864 [0.847, 0.880] | 604 |

Fields without items: none.

## Pairwise comparisons

A wins only when the 95% interval of the paired difference excludes 0.

| A | B | Names | A − B [95% CI] | n | Result |
| --- | --- | --- | --- | --- | --- |
| guessit | @aiostreams/release-parser | own names | -0.005 [-0.014, 0.004] | 389 | tie |
| guessit | @aiostreams/release-parser | Sonarr ParserTests | 0.037 [0.016, 0.059] | 710 | guessit wins |
| guessit | @ctrl/video-filename-parser | own names | 0.018 [0.009, 0.028] | 389 | guessit wins |
| guessit | @ctrl/video-filename-parser | PTT and go-ptt tests | 0.071 [0.048, 0.094] | 604 | guessit wins |
| guessit | parsium-media | own names | -0.017 [-0.025, -0.010] | 389 | parsium-media wins |
| guessit | parsium-media | Sonarr ParserTests + PTT and go-ptt tests | -0.020 [-0.032, -0.008] | 1314 | parsium-media wins |
| @aiostreams/release-parser | @ctrl/video-filename-parser | own names | 0.023 [0.014, 0.033] | 389 | @aiostreams/release-parser wins |
| @aiostreams/release-parser | @ctrl/video-filename-parser | guessit yml | 0.135 [0.102, 0.169] | 1041 | @aiostreams/release-parser wins |
| @aiostreams/release-parser | parsium-media | own names | -0.012 [-0.018, -0.007] | 389 | parsium-media wins |
| @aiostreams/release-parser | parsium-media | guessit yml + Sonarr ParserTests | -0.028 [-0.059, 0.003] | 1751 | tie |
| @ctrl/video-filename-parser | parsium-media | own names | -0.036 [-0.045, -0.027] | 389 | parsium-media wins |
| @ctrl/video-filename-parser | parsium-media | guessit yml + PTT and go-ptt tests | -0.072 [-0.085, -0.059] | 1635 | parsium-media wins |

## Decision

- Own-name scores: @aiostreams/release-parser 0.942, @ctrl/video-filename-parser 0.919, parsium-media 0.954
- Best JS library: parsium-media. Carried forward: parsium-media
- guessit ported: no
- Season or episode losses of a port: none

Decision: use parsium-media
