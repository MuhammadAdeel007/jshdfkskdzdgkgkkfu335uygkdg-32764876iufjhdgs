# NATIONWIDE USA LEAD GENERATION WEBSITE — ARCHITECTURE & PLANNING DOCUMENT

A production-grade planning specification for an enterprise-scale lead generation platform connecting consumers with independent service providers across all 50 U.S. states, counties, cities, metro areas, and service categories.

---

## 1. BRAND NAME IDEAS

The brand must read as a modern infrastructure layer, not a contractor marketplace. Names are intentionally abstract, scalable, and free of geographic or service-specific bias.

Tier 1 — Primary Candidates:

* Northbeam
* Helio Network
* Foundroute
* Lattice Connect
* Parallax Lead Co.
* Northwave Connect
* Atlas Bridge
* Pivot Path
* Northstack
* Mosaic Connect

Tier 2 — Premium Adjacent:

* Lumen Reach
* Verity Connect
* Northbeam Co.
* Helix Reach
* Linear Reach
* Atlas Route
* Cleartide
* Proven Path
* Cornerstone Reach
* Latitude Bridge

Tier 3 — Defensive / Domain Variants:

* Northbeam.io
* HelioNetwork.co
* Foundroute.com
* AtlasBridge.us
* MosaicConnect.io

Naming Principles:

* Abstract, not literal
* Scalable across service verticals
* No state or city references in the primary brand
* No industry-jargon dependency
* Optimized for .com or .io domain ownership
* Pronounceable, three syllables or fewer preferred
* Trademark-clearable

---

## 2. TAGLINE IDEAS

Primary Tagline:

* Connecting America to the providers who keep it running.

Secondary Taglines:

* One platform. Every market. Every service category.
* Find independent providers. Nationwide.
* The infrastructure behind better service decisions.
* Built for scale. Designed for trust.
* Compare. Connect. Choose with confidence.

Tagline Principles:

* No fabricated statistics
* No "best" or "#1" claims
* No geographic exclusivity implied
* Neutral, infrastructure tone
* Conversion-aligned without being aggressive

---

## 3. COLOR PALETTE

A neutral, enterprise-grade palette inspired by Stripe, Linear, Vercel, and Mercury. Designed for long-form content, programmatic page generation, and accessibility.

Primary Palette:

* Background Base: #FFFFFF
* Background Subtle: #FAFAFA
* Background Muted: #F4F4F5
* Surface Elevated: #FFFFFF
* Border Default: #E4E4E7
* Border Strong: #D4D4D8

Text Palette:

* Text Primary: #09090B
* Text Secondary: #3F3F46
* Text Tertiary: #71717A
* Text Inverse: #FAFAFA

Accent Palette (Primary Brand):

* Accent 50: #F5F7FF
* Accent 100: #E0E7FF
* Accent 500: #4F46E5 (Indigo, primary)
* Accent 600: #4338CA
* Accent 700: #3730A3

Accent Palette (Secondary):

* Teal 500: #14B8A6
* Teal 600: #0D9488

Status Palette:

* Success: #16A34A
* Warning: #D97706
* Error: #DC2626
* Info: #2563EB

Dark Mode Palette (Optional v2):

* Background Base: #09090B
* Surface Elevated: #18181B
* Border: #27272A
* Text Primary: #FAFAFA
* Text Secondary: #A1A1AA
* Accent: #818CF8

Accessibility Targets:

* Body text on white: minimum 7:1 contrast ratio
* Accent button text: minimum 4.5:1 contrast ratio
* Focus rings: 3:1 contrast on all backgrounds

---

## 4. TYPOGRAPHY SYSTEM

A modern, neutral type system optimized for readability, scale, and programmatic content generation.

Primary Typeface (UI):

* Inter — Variable, self-hosted preferred
* Fallback: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif

Secondary Typeface (Editorial / Blog):

* Source Serif 4 — for long-form articles
* Fallback: Georgia, Cambria, Times New Roman, serif

Monospace (Code / Data):

* JetBrains Mono
* Fallback: ui-monospace, SFMono-Regular, Menlo, monospace

Type Scale (Desktop):

* Display XL: 72px / 80px / -0.04em / 700
* Display L: 56px / 64px / -0.03em / 700
* H1: 48px / 56px / -0.02em / 600
* H2: 40px / 48px / -0.02em / 600
* H3: 32px / 40px / -0.01em / 600
* H4: 24px / 32px / 0 / 600
* H5: 20px / 28px / 0 / 600
* Body L: 18px / 28px / 0 / 400
* Body M: 16px / 24px / 0 / 400
* Body S: 14px / 20px / 0 / 400
* Caption: 12px / 16px / 0.01em / 500

Type Scale (Mobile):

* Display XL: 48px
* H1: 40px
* H2: 32px
* H3: 24px
* Body: 16px

Font Loading Strategy:

* font-display: swap
* Preload only the 400 and 600 weights
* Subset to Latin + Latin Extended

---

## 5. BUTTON SYSTEM

Three-tier button hierarchy used across the entire platform.

Primary Button:

* Background: #4F46E5 (Accent 500)
* Text: #FFFFFF
* Hover: #4338CA
* Active: #3730A3
* Radius: 12px
* Padding: 14px 24px (desktop), 12px 20px (mobile)
* Font: 16px / 600
* Shadow: 0 1px 2px rgba(0,0,0,0.05), 0 4px 12px rgba(79,70,229,0.15)
* Hover shadow: 0 2px 4px rgba(0,0,0,0.05), 0 8px 24px rgba(79,70,229,0.25)

Secondary Button:

* Background: transparent
* Border: 1.5px solid #E4E4E7
* Text: #09090B
* Hover Background: #FAFAFA
* Hover Border: #D4D4D8
* Radius: 12px
* Padding: 14px 24px

Tertiary Button (Text):

* Background: transparent
* Text: #4F46E5
* Hover Text: #4338CA
* Underline on hover
* Padding: 8px 12px

Destructive Button:

* Background: #DC2626
* Text: #FFFFFF
* Hover: #B91C1C

Button Sizes:

* Large: 48px height, 18px text
* Medium: 40px height, 16px text
* Small: 32px height, 14px text

Button States:

* Default
* Hover
* Active
* Focus (visible 2px ring, offset 2px)
* Disabled (50% opacity, no pointer)

---

## 6. DESIGN SYSTEM

Spacing System:

* 4px base unit
* Scale: 4, 8, 12, 16, 24, 32, 48, 64, 96, 128

Grid System:

* 12-column grid
* Max width: 1280px
* Gutter: 24px (desktop), 16px (mobile)
* Article width: 720–820px
* Responsive containers

Radius System:

* xs: 4px
* sm: 8px
* md: 12px
* lg: 16px
* xl: 24px
* 2xl: 32px
* full: 9999px

Shadow System:

* xs: 0 1px 2px rgba(0,0,0,0.05)
* sm: 0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)
* md: 0 4px 12px rgba(0,0,0,0.08)
* lg: 0 12px 24px rgba(0,0,0,0.10)
* xl: 0 24px 48px rgba(0,0,0,0.12)

Section System:

* Alternating background rhythm
* White / Subtle gray pattern
* Vertical padding: 96px desktop, 64px mobile
* Max width container centered

Icon System:

* Outline style, 1.5px stroke
* 16, 20, 24, 32 size scale
* Library: Lucide Icons (open source, scalable)

---

## 7. UI COMPONENT LIBRARY

Reusable components powering all page templates.

Navigation:

* TopNav (sticky)
* MegaMenu (Services)
* MegaMenu (Locations)
* MobileDrawer
* BreadcrumbBar
* FooterNav

Hero Components:

* HeroDefault
* HeroSearch (location + service)
* HeroMinimal
* HeroWithImage

Content Components:

* SectionHeader
* TextBlock
* ArticleBody
* StatRow (only for non-fabricated metrics)
* PullQuote
* DefinitionList
* TwoColumnSplit
* ThreeColumnGrid

Card Components:

* ServiceCard
* LocationCard
* ProviderCategoryCard
* BlogCard
* FAQCard
* CTACard
* PricingFactorCard
* ComparisonCard

Conversion Components:

* CTABanner
* CTAInline
* CTASticky
* LeadPathBlock (non-form educational CTA)
* ProviderMatchExplainer

Data Display:

* Table (responsive)
* Accordion (FAQ)
* Tabs
* TagList
* RegionList

Trust Components:

* ComplianceDisclaimer
* PlatformExplainer
* EditorialDisclosure
* MethodologyNote

Interactive Components:

* ServiceFinder (client-side, no submission)
* LocationExplorer
* FAQAccordion
* RegionSelector

Layout Components:

* Container
* Stack (vertical rhythm)
* Cluster (horizontal wrap)
* Grid12
* SidebarLayout
* ArticleLayout

---

## 8. FOLDER STRUCTURE

A scalable structure supporting programmatic generation across all 50 states, ~3,143 counties, and ~19,500 cities.

