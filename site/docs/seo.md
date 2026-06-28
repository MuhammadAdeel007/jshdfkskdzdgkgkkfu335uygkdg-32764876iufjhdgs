# SEO ARCHITECTURE

Northbeam is built as a nationwide programmatic SEO platform that scales to millions of indexable URLs across service categories, states, counties, and cities.

## Goals

* Capture long-tail, high-intent search demand across every U.S. market
* Build topical authority through service hubs and content hubs
* Maintain crawl efficiency for millions of generated URLs
* Support clean canonical signals and minimal duplication

## URL Architecture

Tiered, hyphenated, lowercase, entity-first:

* /services/<service-slug>/
* /states/<state-slug>/
* /counties/<state-slug>-<county-slug>/
* /cities/<state-slug>-<city-slug>/
* /blog/<article-slug>/
* /faq/<topic-slug>/
* /about/, /contact/, /get-started/

Each combination page follows:

* /services/<service>/<state>/
* /services/<service>/<state>/<county>/
* /services/<service>/<state>/<city>/

## Indexability

* Every hub and spoke is indexable
* Internal search, admin, API, and process steps are disallowed
* Parameterized URLs are blocked to prevent crawl waste
* Canonical points to the preferred host with trailing slash

## Sitemap Strategy

* A single sitemap index at /sitemap.xml
* Tiered sitemaps per content type to stay under URL-per-file limits
* lastmod values refreshed on regeneration cycles
* All cross-product combinations exposed via dedicated tiers

## robots.txt Strategy

* Allow indexable routes and /assets/
* Block non-public, session-based, and parameterized routes
* Block SEO scrapers and AI training crawlers to protect content
* Major search engines receive explicit crawl-delay tuning
* Host directive consolidates signals to the canonical host

## Metadata Standards

* Unique title and description per page
* Open Graph and Twitter Card metadata on all hub pages
* JSON-LD structured data: Organization, Service, BreadcrumbList,
  FAQPage, Article, LocalBusiness where applicable

## Internal Linking

Hub-and-spoke model:

* Service hubs link to all state hubs
* State hubs link to all counties and services
* County hubs link to all cities and parent state
* City hubs link to parent county, state, and service pages
* Blog articles link contextually to relevant hubs

Full rules documented in /docs/internal-linking.md.

## Performance Signals

* Static-first delivery for crawlable pages
* Minimal render-blocking CSS
* Lazy-loaded non-critical assets
* Preconnect and DNS prefetch for third-party origins

## Monitoring

* Log-based crawl anomaly detection
* Periodic sitemap regeneration
* Quarterly indexation audits per tier
* Disavow and parameter cleanup as required
