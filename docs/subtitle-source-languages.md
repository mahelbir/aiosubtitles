# Subtitle source languages

This page lists the languages each subtitle site serves, which content it covers, and how AIOSubtitles asks it for a
language. The facts come from each site's own docs, from how other Stremio subtitle addons call the site, and from
read-only live searches on 2026-11-20, mostly for The Matrix (`tt0133093`) and Breaking Bad S1E1 (`tt0903747`). A
fact marked _inferred_ was read from the docs or the code but not seen in a live answer.

## Terms

- **Gate:** the source is searched only when the user's language list holds one of its languages, and it is asked only
  for those.
- **Any language:** the source has no gate; it is asked for every language the user picked.
- **Filtered after:** the request names no language; rows in languages the user did not pick are dropped from the
  answer.
- **Gap:** a language the site has that AIOSubtitles never asks for or labels wrong, or a code AIOSubtitles sends that
  the site does not know.

## How the search decides

Each client declares the languages it serves (a fixed list, or any language) and the video types it serves (movie,
series, anime). One check in `apps/api/src/lib/subtitle-search/search-subtitle-source.js` runs before every search,
including the background refresh of a stale cache entry. It sends nothing when the video type is not served or when
none of the user's languages is served; otherwise it passes the client only the served languages. A video is anime
when its id is a Kitsu id. A fixed list is declared only for the language-specific sites: AniSub, AltyazıDB, Jimaku,
BetaSeries, Stremio Community Subtitles and TVsubtitles. Every other site is asked in any language.

## Single-language and few-language sources

### AniSub

- **Languages:** Turkish only.
- **Content:** anime, matched by IMDb id. AniSub's own Stremio addon serves the movie and series types and finds an
  anime through the IMDb ids in its database, so an anime without an IMDb id is not found and a non-anime title returns
  nothing.
- **How we ask:** gate on Turkish, for a movie or series with an IMDb id. A row with an empty language counts as
  Turkish.
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
- **How we ask:** gate on Turkish; one search for Turkish only.
- **Gaps:** English rows are never asked, by choice. The "latest" list ignores the language filter; search respects
  it.

### BetaSeries

- **Languages:** French (VF) and the original language (VO). The subtitles API takes `all`, `vovf`, `vo` or `vf`. VO
  is English even for a German show: Dark returned English files as VO.
- **Content:** series only. The API has subtitle endpoints for episodes and shows, none for movies.
- **How we ask:** gate on French or English. French is sent as VF and English as VO.
- **Gaps:** rows that hold French and the original together (VOVF, one dual file per episode) are dropped, by
  choice. Such a row is one file that holds two languages, so labelling it French or English would put a mixed file
  in a one-language list. A user who wants French already gets the VF rows.

### Stremio Community Subtitles

- **Languages:** a fixed list of 51 codes.
- **Content:** movies and series.
- **How we ask:** gate on the same 51-code list, which matches the site's own list one to one.
- **Gaps:** none.

### TVsubtitles

- **Languages:** 24 flags: Arabic, Brazilian Portuguese, Bulgarian, Chinese, Czech, Danish, Dutch, English, Finnish,
  French, German, Greek, Hungarian, Italian, Japanese, Korean, Polish, Portuguese, Romanian, Russian, Spanish, Swedish,
  Turkish and Ukrainian.
- **Content:** series only.
- **How we ask:** gate on the 24 flag languages, then filtered after. Every flag maps to a language.
- **Gaps:** none.

## Many-language sources

### OpenSubtitles

- **Languages:** 105 codes, from the site's language list. Among them are simplified Chinese (`zh-cn`), traditional
  Chinese (`zh-tw`), Cantonese (`zh-ca`), bilingual Chinese (`ze`), Latin American Spanish (`ea`), Norwegian (`no`) and
  Azerbaijani (`az-az`).
- **Content:** movies and series.
- **How we ask:** the site's own codes. Chinese is sent as `zh-cn` and `zh-tw`, Portuguese as `pt-pt`, Brazilian
  Portuguese as `pt-br`, Latin American Spanish as `ea`, Azerbaijani as `az-az` and Norwegian as `no`; every other
  language goes as its two-letter code. Every code sent reads back as the language that asked it.
- **Gaps:**
  - Cantonese (`zh-ca`) and bilingual Chinese (`ze`) are never asked: AIOSubtitles has no such language.
  - Norwegian Bokmål is still sent as `nb`, which the site does not know: 0 rows. Sending `no` would not help: a `no`
    row reads back as Norwegian, the search keeps only rows in an asked language, and one stored file holds one
    language, so a row cannot count as both. Nothing marks a `no` row as Bokmål rather than Nynorsk, so no clean
    mapping exists: for The Matrix, `no` gave 9 rows, all `no`, and `nb` gave 0 (live probe on 2026-11-20).

### OpenSubtitles v3

- **Languages:** every language, as three-letter codes. A title returns a capped set of rows; 39 languages were seen
  across three titles.
- **Content:** movies and series.
- **How we ask:** filtered after. The legacy codes read as follows: `zht` (traditional Chinese) as Chinese, and `scc`
  and `mne` as Serbian, as subliminal's OpenSubtitles converter reads them; `spn` as Spanish, as the legacy partner of
  the site's `sp` (Spanish, Europe) (_inferred_).
- **Gaps:** `zhe` (bilingual Chinese) and `ast` (Asturian) are dropped: AIOSubtitles has no such language. None of
  these codes was seen live (_inferred_).

### TheSubtitleDB

- **Languages:** the OpenSubtitles set, with its two-letter regional codes. The site reads every traditional Chinese
  variant as `zt` and Latin American Spanish as `ea`.
- **Content:** movies and series.
- **How we ask:** two-letter codes, split into lookups of at most 16 codes each, so no language is dropped. Chinese is
  sent as `zh` and `zt`, Portuguese as `pt` and `pm`, Spanish as `es` and `sp`, Brazilian Portuguese as `pb`, Latin
  American Spanish as `ea` and Norwegian as `no`.
- **Gaps:**
  - Bilingual Chinese (`ze`) and Cantonese (`zc`) are never asked: AIOSubtitles has no such language.
  - Norwegian Bokmål is still sent as `nb`, while the site's rows use `no`, for the same reason as on OpenSubtitles.
    For The Matrix, `no` gave 16 rows, all `no`, and `nb` gave 0 (live probe on 2026-11-20).

### SubSource

- **Languages:** about 120 word codes, such as `english`, `chinese_bg_code` and `spanish_spain`.
- **Content:** movies and series, searched by season.
- **How we ask:** any language, one request per language. The site needs an exact match, so each request lists every
  word of that language, comma-separated: Chinese as `chinese`, `chinese_simplified`, `chinese_traditional`,
  `chinese_bg_code` and `big_5_code`; French as `french`, `french_france` and `french_canada`; Spanish as `spanish`
  and `spanish_spain`. A comma list costs one request: live, `chinese,chinese_bg_code` gave the same 3 rows as
  `chinese_bg_code` alone. When none of the user's languages has a word, nothing is sent, not even the title lookup.
- **Gaps:** Cantonese (`chinese_cantonese`) and bilingual Chinese (`chinese_bilingual`) are never asked, and such a
  row is dropped: AIOSubtitles has no such language.

### SubDL

- **Languages:** "90+ languages", as upper-case two-letter codes plus `BR_PT` and `ZH_BG`. The site's own list is no
  longer online.
- **Content:** movies and series.
- **How we ask:** upper-case two-letter codes; Brazilian Portuguese as `BR_PT`, Chinese as `ZH` and `ZH_BG`.
- **Gaps:** Latin American Spanish is never asked: no code for it was found. The site ignores a code it does not know
  and answers every language: `ES_LA`, `ES-419` and `LA` each gave the same unfiltered page for The Matrix. Every
  Spanish row for The Matrix and Breaking Bad S1E1 was `ES`, labelled "spanish". `EA` is untested: the site answered
  429 (live probe on 2026-11-20).

### Wyzie

- **Languages:** two-letter codes plus `pt-br`. Of its upstream sources we use `charlie` and `xray`, and `oscar`, which
  holds Hebrew only. We leave out `quebec`, which serves many machine-translated languages. `charlie` rows also carry
  the OpenSubtitles codes `ea` ("Spanish (LA)") and `zt` ("Chinese (traditional)") (live probe on 2026-11-20).
- **Content:** movies, series and anime.
- **How we ask:** two-letter codes, Brazilian Portuguese as `pt-br` and Latin American Spanish as `ea`. `oscar` is
  added only when Hebrew is asked. An `ea` row reads as Latin American Spanish and a `zt` row as Chinese. Live
  answers for The Matrix (live probe on 2026-11-20):
  - `ea` gave only the 2 "Spanish (LA)" rows on `charlie`, and none on `xray`; `en,ea` gave both languages;
  - `es` gave the Spanish rows plus those 2 `ea` rows, and `es-419` gave the same set as `es`;
  - `zh` and `zh-tw` both gave the `zh` and `zt` rows, so plain `zh` already reaches traditional Chinese.
- **Gaps:** none.

### Gestdown

- **Languages:** Addic7ed's languages, such as English, Spanish (Spain), Spanish (Latin America), Portuguese (Brazil),
  French (Canadian) and simplified and traditional Chinese. Any culture name is accepted; an unknown one is refused.
- **Content:** series only.
- **How we ask:** any language, one request per culture name, and each row takes the language that asked it. The
  site matches the culture name exactly, so Spanish is sent as `es` and `es-es`, Chinese as `zh-hans` and `zh-hant`,
  and French as `fr` and `fr-ca`. Portuguese is sent as `pt`, Brazilian Portuguese as `pt-br` and Latin American
  Spanish as `es-419`; every other language goes as its two-letter code. Live, plain `es` gave "Spanish" rows for The
  Office and Lost, and `es-es` gave "Spanish (Spain)" rows for Game of Thrones and Breaking Bad.
- **Gaps:** a language the site does not know still costs one request, answered 423 and read as no rows.

### AnimeTosho

- **Languages:** whatever subtitle tracks a release carries, as three-letter codes.
- **Content:** anime, found by Kitsu id.
- **How we ask:** filtered after. A Portuguese track whose name says Brazil becomes Brazilian Portuguese, and a
  Spanish track whose name says Latin America, such as "Latin_America_CR", becomes Latin American Spanish.
- **Gaps:** none. Simplified and traditional Chinese tracks both become Chinese, the one Chinese AIOSubtitles has.

### YIFY

- **Languages:** English language names on each movie page; 38 names were seen, and all of them map.
- **Content:** movies only.
- **How we ask:** filtered after. "Big 5 code" reads as Chinese and "Spanish (Latin America)" as Latin American
  Spanish.
- **Gaps:** none. Neither of those two labels was seen live (_inferred_).

## Where the mapping lives

Shared codes live in `apps/api/src/lib/subtitle-sources/site-language-codes.js`; a code only one site uses lives in
that site's mapping file, which passes its own codes to the shared helpers. OpenSubtitles extends the shared locale
codes with `zh-tw`, `ea` and `az-az`; Wyzie asks `pt-br` and `ea` from its own list and reads rows through the shared
codes; Gestdown, SubSource, OpenSubtitles v3 and YIFY keep their own lists.

AIOSubtitles itself has a single Chinese and no traditional variant, and no Cantonese or bilingual Chinese. Its only
regional codes are Brazilian Portuguese and Latin American Spanish.
