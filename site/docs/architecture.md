# NATIONWIDE USA LEAD GENERATION PLATFORM — ARCHITECTURE DOCUMENT

Version: 1.0
Status: Approved for Build
Audience: Product, Design, Engineering, SEO, Content, Leadership

---

## 1. BRAND FOUNDATION

### 1.1 Brand Positioning

We are not a contractor. We are not a marketplace. We are not a directory.

We are a **nationwide discovery and matching platform** that helps consumers understand their options and connect with qualified, independent service providers across the United States.

**Category:** Lead Generation / Service Discovery Platform
**Comparable Brands (positioning only):** Thumbtack, Angi, HomeAdvisor — but cleaner, faster, more trustworthy, less spammy.

### 1.2 Brand Name Ideas

Primary recommendation first; alternatives follow.

**Tier 1 — Recommended**

1. **Relay** — relayconnects.com / relay.servicemarkets.co
   * Conveys connection, speed, handoff
2. **Hearthline** — hearthline.co
   * Home + guidance + continuity
3. **Northbeam** — northbeam.co
   * Trust, direction, nationwide reach
4. **ServicePath** — servicepath.co
   * Clarity, navigation, decision
5. **Localr** — localr.co
   * National platform, local outcomes

**Tier 2 — Strong Alternatives**

6. **Bridgeway** — bridgeway.co
7. **Maplegrid** — maplegrid.co
8. **Civic** — civic.services
9. **Foundry Home** — foundryhome.co
10. **Surepath** — surepath.co

**Naming rules applied:**

* 1 word, max 2
* No "USA", "America", "Nationwide" in name (built into structure, not branding)
* No fake location or founder names
* .com or .co preferred
* Easy to say, spell, search
* Trademark-safe to the best of our public knowledge

### 1.3 Tagline Ideas

Primary:

* **"Find the right provider, anywhere in America."**
* **"Better decisions start with better options."**
* **"The smarter way to find trusted service."**
* **"Compare. Connect. Choose."**
* **"Search less. Decide better."**

Alternative voice (warmer):

* **"Your project, your terms, your shortlist."**
* **"From question to connection, nationwide."**

Recommendation: Use **"Find the right provider, anywhere in America."** as primary H1 hero lead. Use **"Compare. Connect. Choose."** as marketing tagline.

---

## 2. VISUAL DESIGN SYSTEM

### 2.1 Design Principles

1. Calm over loud
2. Editorial over promotional
3. Restrained color, generous space
4. Type does the heavy lifting
5. Cards feel premium, not template-y
6. Animation is invisible — present but quiet
7. Mobile is the default, not the fallback

### 2.2 Color Palette

**Brand Mark:** Deep Indigo `#1F2A6B` (trust, depth, enterprise)
**Accent / Interactive:** Electric Coral `#FF5A4E` (warmth, action, conversion)
**Surfaces:**

* Background: `#FFFFFF`
* Subtle Background: `#F7F8FA`
* Section Background Alt: `#FBFBFD`
* Card: `#FFFFFF`
* Border Subtle: `#E6E8EE`
* Border Strong: `#D4D7E0`

**Text:**

* Primary: `#0B1020` (near-black)
* Secondary: `#4A5168`
* Tertiary: `#6E7589`
* Inverse: `#FFFFFF`
* Link: `#1F2A6B`
* Link Hover: `#0E1747`

**Status (used sparingly, never decorative):**

* Success: `#0F8A5F`
* Warning: `#B7791F`
* Error: `#C0392B`
* Info: `#1F6FEB`

**Contrast targets (WCAG 2.1 AA):**

* Body text on white: 7:1+
* Secondary text on white: 4.5:1+
* Primary CTA text on coral: 4.5:1+

### 2.3 Typography

**Stack:**

* Display / Headings: `Inter Display`, fallback `Inter`, system-ui
* Body: `Inter`, system-ui, -apple-system
* Mono (data, codes): `JetBrains Mono`, ui-monospace

**Scale (desktop):**

* H1 (Hero): 64px / 1.05 / -0.02em / 600
* H1 (Page): 48px / 1.1 / -0.02em / 600
* H2: 40px / 1.15 / -0.015em / 600
* H3: 28px / 1.25 / -0.01em / 600
* H4: 20px / 1.3 / -0.005em / 600
* Body L: 18px / 1.6 / 400
* Body: 16px / 1.6 / 400
* Small: 14px / 1.5 / 400
* Eyebrow: 12px / 1.4 / 600 / 0.08em uppercase

**Scale (mobile):**

* H1 (Hero): 44px
* H1 (Page): 36px
* H2: 30px
* H3: 24px
* Body: 16px

**Weights used:** 400, 500, 600, 700 (avoid 800+).

### 2.4 Spacing System

Base 4px scale:

`4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96, 128`

**Layout rules:**

* Section vertical padding (desktop): 96px
* Section vertical padding (mobile): 64px
* Container max width: 1280px
* Article content width: 760px
* Grid gutter: 24px
* Grid gutter (mobile): 16px

### 2.5 Radii

* Small (badges, inputs): 8px
* Medium (buttons): 12px
* Large (cards): 20px
* XL (hero panels): 28px
* Full (pills): 9999px

### 2.6 Elevation

* `sm`: `0 1px 2px rgba(11,16,32,0.04)`
* `md`: `0 4px 16px rgba(11,16,32,0.06)`
* `lg`: `0 12px 32px rgba(11,16,32,0.08)`
* `xl`: `0 24px 56px rgba(11,16,32,0.10)`

Hover transitions: 180ms ease-out, transform `translateY(-2px)`.

### 2.7 Motion

* Default ease: `cubic-bezier(0.2, 0.8, 0.2, 1)`
* Durations: 120ms (hover), 220ms (enter), 360ms (page)
* Allowed: fade-up on enter, hover lift on cards, accordion height, button press
* Forbidden: parallax, auto-playing video, scroll-jacking, decorative lottie on load

### 2.8 Button System

**Primary**

* Background: `#1F2A6B`
* Text: `#FFFFFF`
* Hover: `#0E1747`, lift 1px
* Padding: 14px 22px
* Radius: 12px
* Font: 15px / 600 / 0.01em
* Min height: 48px

**Accent (conversion CTA)**

* Background: `#FF5A4E`
* Text: `#FFFFFF`
* Hover: `#E13D31`
* Used sparingly on hero & bottom CTA only

**Secondary**

* Border: 1.5px solid `#D4D7E0`
* Background: transparent
* Text: `#0B1020`
* Hover: border `#0B1020`

**Tertiary (text link)**

* No background, no border
* Underline on hover only
* Color: `#1F2A6B`

**States:** default / hover / active / focus-visible / disabled. Focus ring: `0 0 0 3px rgba(31,42,107,0.25)`.

### 2.9 Iconography

* Library: Lucide (open, consistent stroke)
* Stroke: 1.75
* Default size: 20px (UI), 24px (cards), 28px (hero)
* Color inherits text color

### 2.10 Imagery Policy

* No stock photos of fake technicians
* No fake "team" photos
* Allowed: real photos of homes, projects, generic architecture, UGC-style abstract
* Always alt-text, never decorative alt-empty
* Lazy load below the fold
* AVIF + WebP fallback

---

## 3. UI COMPONENT LIBRARY

| Component | Variants | Notes |
|-----------|----------|-------|
| Button | primary, accent, secondary, tertiary, ghost | 5 sizes: sm, md, lg, xl, icon |
| Input | text, search, select, textarea | 48px tall, 12px radius |
| Tag / Chip | default, selected, removable | Used for categories, filters |
| Card | service, location, blog, faq, cta, stat | 20px radius, md shadow, hover lift |
| Accordion | single, multi | Keyboard nav, ARIA, smooth height |
| Tabs | underline, pill | For service detail sub-sections |
| Breadcrumb | standard | Schema-ready |
| Pagination | numeric, prev/next | For blog index |
| Banner | info, disclaimer | Required disclaimer present site-wide |
| Modal | info only | No lead-capture forms allowed |
| Toast | success, info, warning | Used sparingly |
| Tooltip | hover, focus | Plain text |
| Progress | stepper | For "how it works" |
| Sticky CTA | bar | Mobile only, dismissible per session |

---

## 4. INFORMATION ARCHITECTURE

### 4.1 Site Map

