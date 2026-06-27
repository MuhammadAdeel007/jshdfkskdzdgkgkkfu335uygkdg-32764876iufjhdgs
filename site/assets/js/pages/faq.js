import { renderHeader } from '../components/header.js';
import { renderFooter } from '../components/footer.js';
import { renderBreadcrumbs } from '../components/breadcrumbs.js';
import { renderCtaBanner } from '../components/cta-banner.js';
import { renderLeadCta } from '../components/lead-cta.js';
import { renderDisclaimer } from '../components/disclaimer.js';

const FAQs = [
  { cat:'Services', q:'What is Northbeam?', a:'Northbeam is a nationwide platform that helps consumers connect with independent service providers across all 50 states, counties, and cities.' },
  { cat:'Services', q:'What services are available?', a:'Multiple residential and commercial categories. Availability varies by category and location.' },
  { cat:'Services', q:'Does Northbeam perform the service directly?', a:'No. Northbeam is a matching and directory platform. Services are performed by independent providers.' },
  { cat:'Services', q:'Do you offer commercial or residential services?', a:'Both may be supported depending on category and provider availability in your location.' },
  { cat:'Services', q:'Can I request multiple categories at once?', a:'Yes. You may submit separate requests for each service category.' },

  { cat:'Pricing', q:'How is pricing determined?', a:'Pricing is set by each independent provider. Northbeam may show estimated ranges.' },
  { cat:'Pricing', q:'Is Northbeam free to use?', a:'Submitting a request is free for consumers. Service costs are agreed with the provider.' },
  { cat:'Pricing', q:'Are estimates binding?', a:'No. Estimates are non-binding and informational only.' },
  { cat:'Pricing', q:'Do estimates include taxes or fees?', a:'No. Final pricing, taxes, and fees are determined by the provider.' },

  { cat:'Availability', q:'How quickly will a provider contact me?', a:'Response times vary. Northbeam does not guarantee a response or response time.' },
  { cat:'Availability', q:'What if no providers are available in my area?', a:'You may not receive matches. Coverage is not guaranteed in any specific location.' },
  { cat:'Availability', q:'Can I cancel my request?', a:'Yes. Cancellation does not affect obligations you may have entered into with a provider.' },

  { cat:'State Coverage', q:'Do you operate in all 50 states?', a:'The directory framework covers all 50 states; provider coverage within each state varies.' },
  { cat:'State Coverage', q:'Why does coverage vary by state?', a:'Coverage depends on the independent providers who actively participate in each market.' },

  { cat:'County Coverage', q:'How are county pages organized?', a:'County pages cover a single county and show service availability within it.' },
  { cat:'County Coverage', q:'Can I search by county?', a:'Yes. Use the directory to find your county or submit a request with your zip code.' },

  { cat:'City Coverage', q:'How are city pages organized?', a:'City pages cover a single city or town and list local provider availability.' },
  { cat:'City Coverage', q:'What if my city is not listed?', a:'Submit a request and we will attempt to match based on the nearest covered area.' },

  { cat:'Estimates', q:'Does Northbeam provide estimates?', a:'Estimates are illustrative ranges only and are not quotes or offers of service.' },
  { cat:'Estimates', q:'How are estimates calculated?', a:'Estimates use category, location, and historical ranges; they do not reflect final pricing.' },

  { cat:'Provider Matching', q:'How does matching work?', a:'You submit a request. We match with available independent providers in your area.' },
  { cat:'Provider Matching', q:'Can I choose my provider?', a:'Matching is based on availability. You are not obligated to engage with any matched provider.' },
  { cat:'Provider Matching', q:'Are providers licensed and insured?', a:'Northbeam does not verify licensing, insurance, or quality. You are responsible for verifying.' },
  { cat:'Provider Matching', q:'What if I have a dispute with a provider?', a:'Disputes are between you and the provider. Northbeam may assist communication only.' },
  { cat:'Provider Matching', q:'Do providers advertise on Northbeam?', a:'Participation is governed by separate terms and is not a paid endorsement.' },
  { cat:'Provider Matching', q:'Does submitting a request create a contract?', a:'No. Any contract is between you and the independent provider.' },
  { cat:'Provider Matching', q:'Do you verify reviews or ratings?', a:'Northbeam may display feedback but does not warrant its accuracy.' }
];

const CATEGORIES = ['Services','Pricing','Availability','State Coverage','County Coverage','City Coverage','Estimates','Provider Matching'];

function faqItem(q,a){
  return `<details class="faq-item"><summary>${q}</summary><div class="faq-answer">${a}</div></details>`;
}

function renderFaqPage(){
  const root = document.querySelector('[data-component="faq-page"]');
  if(!root) return;
  root.innerHTML = `
    <div class="container">
      <header class="section-header">
        <span class="eyebrow">Help Center</span>
        <h1>Frequently Asked Questions</h1>
        <p>Answers about services, coverage, pricing, estimates, and matching with independent providers. Northbeam does not guarantee availability, pricing, or outcomes.</p>
      </header>
      <form class="availability" role="search" aria-label="Search FAQs" onsubmit="event.preventDefault();">
        <div class="availability-row">
          <label class="visually-hidden" for="faq-search">Search questions</label>
          <input id="faq-search" type="search" placeholder="Search questions (e.g. pricing, coverage, estimates)" style="flex:1;min-width:240px;height:40px;padding:0 var(--s-3);border:1px solid var(--border);border-radius:var(--r-md);font-size:14px;">
          <button class="btn btn-primary" type="submit">Search</button>
        </div>
      </form>
      <div id="faq-results" style="margin-top:var(--s-7)">
        ${CATEGORIES.map(cat => `
          <section style="margin-bottom:var(--s-7)">
            <h2 style="font-size:24px;margin-bottom:var(--s-4)">${cat}</h2>
            <div class="faq">
              ${FAQs.filter(f => f.cat === cat).map(f => faqItem(f.q, f.a)).join('')}
            </div>
          </section>
        `).join('')}
      </div>
    </div>
  `;
  const input = root.querySelector('#faq-search');
  const results = root.querySelector('#faq-results');
  input.addEventListener('input', () => {
    const term = input.value.trim().toLowerCase();
    if(!term){ render(); return; }
    const matches = FAQs.filter(f => (f.q + ' ' + f.a + ' ' + f.cat).toLowerCase().includes(term));
    results.innerHTML = `
      <section>
        <h2 style="font-size:24px;margin-bottom:var(--s-4)">Results</h2>
        <div class="faq">${matches.length ? matches.map(f => faqItem(f.q, f.a)).join('') : '<p>No matching questions found.</p>'}</div>
      </section>
    `;
  });
  function render(){ results.innerHTML = CATEGORIES.map(cat => `
    <section style="margin-bottom:var(--s-7)">
      <h2 style="font-size:24px;margin-bottom:var(--s-4)">${cat}</h2>
      <div class="faq">${FAQs.filter(f => f.cat === cat).map(f => faqItem(f.q, f.a)).join('')}</div>
    </section>
  `).join(''); }
}

renderHeader();
renderBreadcrumbs([{label:'Home',href:'/'},{label:'FAQ',href:'/faq.html'}]);
renderCtaBanner({
  eyebrow:'Help Center',
  title:'Frequently Asked Questions',
  body:'Find quick answers about services, coverage, pricing, and provider matching.',
  primary:{label:'Submit a Request',href:'/#lead-cta'},
  secondary:{label:'Browse Services',href:'/services.html'}
});
renderLeadCta();
renderFaqPage();
renderDisclaimer();
renderFooter();
