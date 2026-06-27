# CONTENT MODEL — LOCATION PAGES

Structured fields driving programmatic generation.

## State

* name
* slug
* abbreviation
* region (Northeast, Midwest, South, West)
* population_tier (large, mid, small)
* metro_count
* county_count
* intro_summary
* climate_notes
* regulatory_notes
* top_services[]

## County

* name
* slug
* state_slug
* state_name
* population_tier
* city_count
* regional_economic_notes
* common_issues[]
* faqs[]

## City

* name
* slug
* state_slug
* state_name
* county_slug
* population_tier
* urban_classification (urban, suburban, rural)
* market_notes
* common_issues[]
* faqs[]

## Generation Rules

* No fabricated statistics
* All facts traceable to authoritative public sources
* Generic phrasing when data unavailable
* Tone neutral, editorial, non-promotional
