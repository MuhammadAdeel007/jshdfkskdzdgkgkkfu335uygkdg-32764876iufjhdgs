# INTERNAL LINKING STRATEGY

A hub-and-spoke model connecting service, state, county, city, and content pages through contextual, programmatic links.

## Hierarchy

* Hub: Service Category page (e.g. /services/plumbing/)
* Hub: State page (e.g. /states/texas/)
* Spoke: County page
* Spoke: City page
* Cross-link: Blog and guide content

## Linking Rules

* Every state page links to its counties
* Every county page links to its cities and state
* Every city page links to its county and state
* Every service page links to all states
* Every state page links to all service categories
* Every location page links to related services

## Anchor Text

* Descriptive, never generic
* Include entity name (city, county, service)
* Avoid exact-match repetition
* Mix partial-match and long-tail anchors

## Orphan Prevention

* Auto-generated Related Locations and Related Services blocks
* Breadcrumb trail on every page
* Footer navigation links to all hubs
* XML sitemap includes every generated URL

## Crawl Depth

* No page deeper than 4 clicks from homepage
* Sitemap exposes every URL tier
* Robots allows indexing for all location and service routes
