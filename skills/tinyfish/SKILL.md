---
name: tinyfish
description: Search the web or fetch URL content with TinyFish HTTP APIs. Use for current facts, news, product comparisons, research, or reading a specific URL. Requires TINYFISH_API_KEY; use the search endpoint for discovery and the fetch endpoint for full page content.
compatibility: Requires TINYFISH_API_KEY.
---

# TinyFish

Use TinyFish HTTP APIs for web retrieval. Do not use a CLI or MCP server.

Set the API key in the environment. Never place it in a command, source file, or response.

```sh
export TINYFISH_API_KEY="<API_KEY>"
```

## Route Requests

- Search or current-facts request: `GET https://api.search.tinyfish.ai/`
- Specific URL or full-page-content request: `POST https://api.fetch.tinyfish.ai/`

Search first when URLs are unknown. Fetch selected, credible sources before making consequential factual claims. A direct URL skips search.

## Search

Search returns ranked titles, snippets, and URLs. It is evidence discovery, not proof.

```sh
curl --get "https://api.search.tinyfish.ai/" \
  --header "X-API-Key: $TINYFISH_API_KEY" \
  --data-urlencode "query=<QUERY>" \
  --data-urlencode "purpose=<WHY_THIS_SEARCH_IS_NEEDED>"
```

Optional query parameters: `location`, `language`, `domain_type` (`web`, `news`, or `research_paper`), `recency_minutes`, `after_date`, `before_date`, `include_thumbnail`, and `page` (0 to 10). Do not combine temporal filters with `research_paper`.

For news or time-sensitive questions, use `domain_type=news` and either `recency_minutes` or an `after_date`/`before_date` window.

## Fetch

Fetch extracts clean content from one to ten URLs in parallel. Default to `markdown`; use `html` or `json` only when needed.

```sh
curl "https://api.fetch.tinyfish.ai/" \
  --request POST \
  --header "X-API-Key: $TINYFISH_API_KEY" \
  --header "Content-Type: application/json" \
  --data '{"urls":["https://example.com"],"format":"markdown","purpose":"<WHY_THIS_CONTENT_IS_NEEDED>"}'
```

Useful optional request fields: `links`, `image_links`, `include_selectors`, `exclude_selectors`, `per_url_timeout_ms`, and `ttl`. Inspect both `results` and per-URL `errors`; one failed URL does not fail the batch.

## Evidence

1. Prefer primary sources, official documentation, original research, and direct reporting.
2. Base factual claims on fetched content, not snippets.
3. Cross-check consequential claims with independent sources when practical.
4. Cite claims precisely with source title and URL. State uncertainty and conflicts.
5. Stop when the evidence answers the request.

## References

- Search API: https://docs.tinyfish.ai/api-reference/search-the-web
- Fetch API: https://docs.tinyfish.ai/api-reference/fetch-and-extract-content-from-urls
