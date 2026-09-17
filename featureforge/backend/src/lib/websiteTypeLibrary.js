// The 'website' stream's library of site types — what FeatureForge knows
// about the real-world shape of each kind of site it can build. Saved here
// as a standing reference (not just baked once into a prompt string) so it
// can grow independently and stay the single source of truth for both the
// system prompt (buildWebsiteTypeGuide below) and the frontend's "Site
// type" dropdown, which mirrors these labels by hand — see
// frontend/src/FeatureRequestForm.jsx's `WEBSITE_SITE_TYPES`.
//
// Each entry is deliberately structural, not decorative: what pages/
// sections a real site of that type has, and (for the two shopping types)
// what actual client-side behavior it needs — not just visual guidance,
// since a landing page and a shopping cart differ in *mechanics*, not just
// layout.
export const WEBSITE_TYPE_LIBRARY = [
  {
    id: "landing-page",
    label: "Landing page",
    summary: "A single page selling one thing, ending in one clear action.",
    sections: ["Hero with one headline + one primary CTA", "Value props / features", "Social proof (testimonials, logos, or stats)", "Secondary CTA", "Footer"],
    notes: "One page, one CTA repeated — never split attention across several competing actions.",
  },
  {
    id: "portfolio",
    label: "Portfolio",
    summary: "A personal or studio showcase built around a project grid.",
    sections: ["Hero/intro with name + one-line pitch", "Project grid (image + title + 1-line result per project)", "About/bio", "Contact"],
    notes: "The projects ARE the pitch — keep copy short everywhere else so the work stays the focus.",
  },
  {
    id: "blog",
    label: "Blog",
    summary: "A post listing plus at least one real, complete post.",
    sections: ["Post list page (title, date, excerpt per post, newest first)", "At least one full post page linked from the list", "About/author section (page or footer)"],
    notes: "Never generate a list page whose posts don't actually exist — always write the real post file(s) too.",
  },
  {
    id: "business",
    label: "Business / marketing site",
    summary: "A general small-business or company site.",
    sections: ["Home (hero + overview)", "About", "Services or products", "Testimonials", "Contact", "(Optional) Team page"],
    notes: "Default for anything that doesn't clearly match a more specific type below.",
  },
  {
    id: "ecommerce-storefront",
    label: "E-commerce storefront",
    summary: "A product catalog — browsing and discovery, not a working cart.",
    sections: ["Home", "Product listing / category grid (image, name, price per item)", "Product detail page (images, price, description, variant selector, 'Add to cart' button)", "Cart page or drawer showing what would be in it"],
    notes:
      "'Add to cart' can update a visible (even if non-persistent) cart badge count via plain JS, but real payment/checkout processing is out of scope — a checkout page, if included, is a static form with a note that it needs a real payment processor wired in.",
  },
  {
    id: "shop-engine",
    label: "Shop / cart engine",
    summary: "An e-commerce storefront with a REAL working client-side cart.",
    sections: [
      "Everything ecommerce-storefront has",
      "A cart that actually works: add/remove items, change quantity, running subtotal — implemented in plain JS, state kept in localStorage so it survives a page reload",
      "A cart page or drawer that reads that real state, not a static mock",
      "Checkout page: real client-side form validation (required fields, basic email/card-format checks), but still no real payment processing — say so in `explanation`",
    ],
    notes:
      "The difference from ecommerce-storefront is mechanical, not visual: this type needs genuine JS state management (an array of {id, name, price, qty} in localStorage, functions to add/remove/update it, and totals that recompute from it), not just a styled cart icon.",
  },
  {
    id: "restaurant",
    label: "Restaurant / cafe",
    summary: "A menu-first hospitality site.",
    sections: ["Hero (name, cuisine, hours-at-a-glance)", "Menu (categorized items with prices)", "Hours & location (address, a map placeholder is fine)", "Reservation or contact form", "Photo gallery"],
    notes: "The menu is the centerpiece — give it more visual weight than any other section.",
  },
  {
    id: "real-estate",
    label: "Real estate listings",
    summary: "A property listing site.",
    sections: ["Home with a search/filter bar (can be non-functional or simple client-side filtering)", "Listing grid (photo, price, beds/baths, address per card)", "Property detail page (gallery, full details, inquiry form)", "Agent/agency contact info"],
    notes: "",
  },
  {
    id: "event",
    label: "Event / conference",
    summary: "A single-event site built around a date.",
    sections: ["Hero with event name, date, and a 'Get Tickets' or 'Register' CTA", "Schedule/agenda", "Speakers or lineup grid", "Venue/location", "Registration or ticket CTA (form or link)"],
    notes: "The date is load-bearing — put it in the hero and repeat it near the final CTA.",
  },
  {
    id: "nonprofit",
    label: "Nonprofit / donation",
    summary: "A cause-driven site centered on a donate action.",
    sections: ["Hero (mission statement)", "Impact stats or stories", "Programs/causes", "Donate CTA (static form or button — no real payment processing)", "Volunteer or contact"],
    notes: "",
  },
  {
    id: "saas",
    label: "SaaS / app product site",
    summary: "A marketing site for a software product.",
    sections: ["Hero (product name, one-line value prop, primary CTA like 'Start free trial')", "Features grid", "Pricing tiers (3 tiers is the norm, one marked 'Most Popular')", "FAQ", "Final signup CTA"],
    notes: "",
  },
  {
    id: "documentation",
    label: "Documentation site",
    summary: "Reference docs with real navigable structure.",
    sections: ["A sidebar or top nav listing every page", "At least 2-3 real content pages (not just placeholders) with headings and code blocks where relevant", "A clear home/index page"],
    notes: "Every nav link must point to a page that actually exists in this plan — never a dead link.",
  },
  {
    id: "resume",
    label: "Personal resume / CV",
    summary: "A single-page professional profile.",
    sections: ["Hero (name, title, one-line pitch)", "Experience (timeline or list, most recent first)", "Skills", "Education", "Contact / links (email, LinkedIn, etc. as placeholders)"],
    notes: "",
  },
  {
    id: "news",
    label: "News / magazine",
    summary: "An editorial site organized by section/category.",
    sections: ["Home with a featured story hero + article grid grouped by category", "At least one full article page", "Newsletter signup"],
    notes: "Same rule as blog: don't list articles that don't have a real page behind them.",
  },
  {
    id: "directory",
    label: "Directory / listings",
    summary: "A searchable list of things (businesses, resources, people).",
    sections: ["Search/filter bar (client-side JS filtering over the listed items is enough)", "Listing cards (name, short description, category)", "Detail view per listing (its own page, or an expandable card)"],
    notes: "",
  },
  {
    id: "wedding",
    label: "Wedding / personal event",
    summary: "A personal celebration site.",
    sections: ["Hero (names + date)", "Our story", "Schedule/itinerary", "RSVP (static form)", "Registry links (placeholders)"],
    notes: "",
  },
  {
    id: "agency",
    label: "Agency / freelancer services",
    summary: "A services business built around case studies and process.",
    sections: ["Hero (what you do, for whom)", "Services/packages", "Process (numbered steps)", "Case studies or portfolio highlights", "Contact / 'Book a call' CTA"],
    notes: "",
  },
  {
    id: "app-landing",
    label: "App / download landing page",
    summary: "A marketing page for a mobile or desktop app.",
    sections: ["Hero (app name, one-line pitch, phone mockup or screenshot area)", "Features", "App store / download badges (as styled placeholder buttons)", "FAQ"],
    notes: "",
  },
  {
    id: "coming-soon",
    label: "Coming soon / waitlist",
    summary: "A minimal pre-launch page.",
    sections: ["Hero (what's coming + a short teaser)", "Email capture form", "(Optional) countdown", "Social links"],
    notes: "Deliberately sparse — this is the one type where a single short section is correct, not incomplete.",
  },
];

// Rendered once into the 'website' stream's system prompt (see
// claudeClient.js) so every request — whatever type it names — gets this
// as ground truth instead of the model improvising a structure from the
// type's name alone.
export function buildWebsiteTypeGuide() {
  return WEBSITE_TYPE_LIBRARY.map((t) => {
    const lines = [`- ${t.label}: ${t.summary}`, `  Needs: ${t.sections.join("; ")}.`];
    if (t.notes) lines.push(`  Note: ${t.notes}`);
    return lines.join("\n");
  }).join("\n");
}
