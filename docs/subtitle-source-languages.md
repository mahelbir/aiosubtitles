# Subtitle source languages

This page lists the languages each subtitle site serves, which content it covers, and how AIOSubtitles asks it for a
language. The facts come from each site's own docs, from how other Stremio subtitle addons call the site, and from
read-only live searches on 2026-11-20, mostly for The Matrix (`tt0133093`) and Breaking Bad S1E1 (`tt0903747`). A
fact marked _inferred_ was read from the docs or the code but not seen in a live answer.

## Terms

- **Gate:** the source is searched only when the user's language list holds one of its languages.
- **Filtered after:** the request names no language; rows in languages the user did not pick are dropped from the
  answer.
- **Gap:** a language the site has that AIOSubtitles never asks for or labels wrong, or a code AIOSubtitles sends that
  the site does not know.

## Single-language and few-language sources

### AniSub

- **Languages:** Turkish only.
- **Content:** anime, matched by IMDb id. AniSub's own Stremio addon serves the movie and series types and finds an
  anime through the IMDb ids in its database, so an anime without an IMDb id is not found and a non-anime title returns
  nothing.
- **How we ask:** gate on Turkish. A row with an empty language counts as Turkish.
- **Gaps:** none.

### Jimaku

- **Languages:** Japanese only. The site has no language field, and other Stremio subtitle addons also search it only
  for Japanese anime.
- **Content:** anime, found by Kitsu id. The site also lists movies and TMDB entries, which we do not search.
- **How we ask:** gate on Japanese; every row is Japanese.
- **Gaps:** none.

### AltyazıDB

- **Languages:** Turkish and English. Its search takes `tr` or `en`.
  - Turkish holds about 92 to 97% of the rows.
  - With no language filter, The Matrix gave 46 Turkish and 4 English rows. An English search for Breaking Bad S1E1
    gave 1 row.
- **Content:** movies and series, with season packs.
- **How we ask:** one search per language, Turkish and English only.
- **Gaps:** none. The "latest" list ignores the language filter; search respects it. Whether the rows marked English
  really hold English text was not checked, because that needs a download.

### BetaSeries

- **Languages:** French (VF) and the original language (VO). The subtitles API takes `all`, `vovf`, `vo` or `vf`. VO
  is English even for a German show: Dark returned English files as VO.
- **Content:** series only. The API has subtitle endpoints for episodes and shows, none for movies.
- **How we ask:** gate on French or English. French is sent as VF and English as VO.
- **Gaps:** rows that hold French and the original together (VOVF, one dual file per episode) are dropped.

### Stremio Community Subtitles

- **Languages:** a fixed list of 51 codes.
- **Content:** movies and series.
- **How we ask:** from the same 51-code list, which matches the site's own list one to one.
- **Gaps:** none.

### TVsubtitles

- **Languages:** 24 flags: Arabic, Brazilian Portuguese, Bulgarian, Chinese, Czech, Danish, Dutch, English, Finnish,
  French, German, Greek, Hungarian, Italian, Japanese, Korean, Polish, Portuguese, Romanian, Russian, Spanish, Swedish,
  Turkish and Ukrainian.
- **Content:** series only.
- **How we ask:** filtered after. Every flag maps to a language.
- **Gaps:** none.

## Many-language sources

### OpenSubtitles

- **Languages:** 105 codes, from the site's language list. Among them are simplified Chinese (`zh-cn`), traditional
  Chinese (`zh-tw`), Cantonese (`zh-ca`), bilingual Chinese (`ze`), Latin American Spanish (`ea`), Norwegian (`no`) and
  Azerbaijani (`az-az`).
- **Content:** movies and series.
- **How we ask:** locale codes. Chinese is sent as `zh-cn`, Portuguese as `pt-pt` and Brazilian Portuguese as `pt-br`;
  every other language goes as its two-letter code.
- **Gaps:**
  - Latin American Spanish is never asked, though the site has it: 2 rows for The Matrix.
  - Chinese asks only simplified. Traditional Chinese (4 rows for The Matrix), Cantonese and bilingual Chinese never
    come.
  - Norwegian is sent as `nb`, which the site does not know: 0 rows. The site uses `no`.
  - Azerbaijani is sent as `az`, but the site uses `az-az` (_inferred_).

### OpenSubtitles v3

- **Languages:** every language, as three-letter codes. A title returns a capped set of rows; 39 languages were seen
  across three titles.
- **Content:** movies and series.
- **How we ask:** filtered after.
- **Gaps:** the legacy codes `zht`, `zhe`, `spn`, `scc`, `mne` and `ast` would be dropped. None was seen (_inferred_).

### TheSubtitleDB

- **Languages:** the OpenSubtitles set, with its two-letter regional codes. The site reads every traditional Chinese
  variant as `zt` and Latin American Spanish as `ea`.
- **Content:** movies and series.
- **How we ask:** two-letter codes, at most 16 per search. Chinese is sent as `zh` and `zt`, Portuguese as `pt` and
  `pm`, Spanish as `es` and `sp`, Brazilian Portuguese as `pb` and Latin American Spanish as `ea`.
- **Gaps:**
  - A user with more than 16 languages loses the rest without notice.
  - Bilingual Chinese (`ze`) and Cantonese (`zc`) are never asked.
  - Norwegian is sent as `nb`, while the site's rows use `no` (_inferred_).

### SubSource

- **Languages:** about 120 word codes, such as `english`, `chinese_bg_code` and `spanish_spain`.
- **Content:** movies and series, searched by season.
- **How we ask:** one word per language, and the site needs an exact match.
- **Gaps:**
  - Chinese is sent as `chinese`: 0 rows for The Matrix, while `chinese_bg_code` gave 3. Simplified, traditional, Big5,
    Cantonese and bilingual Chinese are never asked.
  - French misses `french_france` and `french_canada`; Spanish misses `spanish_spain` (_inferred_ from the same
    exact-match rule).
  - Brazilian Portuguese is sent as `brazilian_portuguese`, which works.

### SubDL

- **Languages:** "90+ languages", as upper-case two-letter codes plus `BR_PT` and `ZH_BG`. The site's own list is no
  longer online.
- **Content:** movies and series.
- **How we ask:** upper-case two-letter codes; Brazilian Portuguese as `BR_PT`, Chinese as `ZH` and `ZH_BG`.
- **Gaps:** Latin American Spanish is never asked. Not probed live, because a search spends quota.

### Wyzie

- **Languages:** two-letter codes plus `pt-br`. Of its upstream sources we use `charlie` and `xray`, and `oscar`, which
  holds Hebrew only. We leave out `quebec`, which serves many machine-translated languages.
- **Content:** movies, series and anime.
- **How we ask:** two-letter codes, Brazilian Portuguese as `pt-br`. `oscar` is added only when Hebrew is asked.
- **Gaps:** Latin American Spanish is never asked. Whether Wyzie takes `es-419` or `zh-tw` is unknown. Not probed
  live, because a search spends billed requests.

### Gestdown

- **Languages:** Addic7ed's languages, such as English, Spanish (Spain), Spanish (Latin America), Portuguese (Brazil),
  French (Canadian) and simplified and traditional Chinese. Any culture name is accepted; an unknown one is refused.
- **Content:** series only.
- **How we ask:** one request per language, with locale codes. Portuguese is sent as `pt`, Chinese as `zh-hans` and
  Latin American Spanish as `es-419`.
- **Gaps:**
  - Spanish is sent as `es`: 0 rows for Breaking Bad S1E1, while `es-es` gave 2 Spanish (Spain) rows.
  - Traditional Chinese (`zh-hant`) and Canadian French (`fr-ca`) are never asked.

### AnimeTosho

- **Languages:** whatever subtitle tracks a release carries, as three-letter codes.
- **Content:** anime, found by Kitsu id.
- **How we ask:** filtered after. A Portuguese track whose name says Brazil becomes Brazilian Portuguese.
- **Gaps:**
  - A Latin American Spanish track carries the plain Spanish code with a name like "Latin_America_CR", and we label it
    Spanish (Spain).
  - Simplified and traditional Chinese tracks both become one Chinese.

### YIFY

- **Languages:** English language names on each movie page; 38 names were seen, and all of them map.
- **Content:** movies only.
- **How we ask:** filtered after.
- **Gaps:** labels such as "Big 5 code" or "Spanish (Latin America)" would be dropped. None was seen (_inferred_).

## Shared causes

Several gaps share one cause in `apps/api/src/lib/subtitle-sources/site-language-codes.js`:

- The locale style has no code for Latin American Spanish.
- Chinese maps to simplified Chinese only.

AIOSubtitles itself has a single Chinese and no traditional variant. Its only regional codes are Brazilian Portuguese
and Latin American Spanish.
