# URL STRUCTURE

Programmatic, scalable URL patterns for all entities.

## Patterns

* Homepage: /
* Services hub: /services/
* Service category: /services/{service-slug}/
* States hub: /states/
* State: /states/{state-slug}/
* Counties hub: /counties/
* County: /counties/{county-slug}-{state-slug}/
* Cities hub: /cities/
* City: /cities/{city-slug}-{state-slug}/
* Blog: /blog/
* Article: /blog/{article-slug}/

## Slug Rules

* Lowercase, hyphenated
* No state abbreviations (use full slugs)
* Counties suffixed with state slug to prevent collisions
* Cities suffixed with state slug for uniqueness
* Reserved words: admin, api, assets, dashboard

## Canonicalization

* Self-canonical on every page
* Trailing slash enforced
* Lowercase enforced via redirect
* Parameterized URLs blocked from indexing
