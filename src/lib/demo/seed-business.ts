import type { BrandProfile } from "@/lib/domain/brand"
import type { BusinessProfile, MarketingIntelligence } from "@/lib/domain/business"

export const DEMO_BUSINESS_PROFILE: BusinessProfile = {
  name: "Saffron & Sage",
  industry: "Restaurants & food",
  website: "https://saffronandsage.example",
  city: "Bengaluru",
  region: "Karnataka",
  country: "India",
  description:
    "A modern Indian restaurant group with three outlets in Indiranagar, Koramangala and HSR Layout. We serve slow-cooked regional Indian dishes for dine-in and delivery, and run a growing catering business for weddings and corporate events.",
  productsAndServices: [
    "Dine-in (3 outlets)",
    "Delivery via Swiggy & Zomato",
    "Wedding and event catering (50–500 guests)",
    "Corporate lunch subscriptions",
    "Festive gifting hampers",
  ],
  targetAudience:
    "Urban professionals aged 24–45 in south and east Bengaluru who value authentic regional food, plus families and couples planning celebrations and events.",
  customerSegments: [
    "Young professionals ordering weekday delivery",
    "Families dining out on weekends",
    "Couples and families planning weddings",
    "HR and admin teams booking corporate catering",
  ],
  businessModel: "b2c",
  competitors: [
    { name: "Bombay Brasserie Co.", website: "" },
    { name: "Ghar Ka Khana Kitchens", website: "" },
    { name: "The Tandoor Story", website: "" },
  ],
  objectives: [
    "Grow weekday delivery orders by 25% this quarter",
    "Generate 120 qualified catering leads per month during wedding season",
    "Build an Instagram community of food lovers in Bengaluru",
  ],
  monthlyBudgetInr: 150000,
  preferredChannels: ["instagram", "facebook", "google_ads", "youtube", "whatsapp"],
}

const allApprovedExceptPlan = {
  summary: "approved",
  personas: "approved",
  valueProposition: "approved",
  competitorInsights: "draft",
  opportunities: "approved",
  recommendedChannels: "approved",
  strategy: "approved",
  plan30Day: "draft",
} as const

export const DEMO_INTELLIGENCE: MarketingIntelligence = {
  isSample: true,
  generatedAt: "2026-11-02T09:30:00.000Z",
  generatedBy: "Marketing Strategist (sample)",
  sectionStatus: { ...allApprovedExceptPlan },
  content: {
    summary:
      "Saffron & Sage is a three-outlet modern Indian restaurant group in Bengaluru known for slow-cooked regional dishes. Revenue comes from dine-in, aggregator delivery and a fast-growing catering arm. The brand has strong food quality signals but under-uses owned channels: most delivery demand is captured by aggregators, and catering is promoted almost entirely through word of mouth.",
    valueProposition:
      "Slow-cooked, regional Indian food made the traditional way — served with modern hospitality, whether you dine in, order in or celebrate with 500 guests.",
    personas: [
      {
        name: "Weekday Priya",
        snapshot: "29, product manager in Koramangala, orders lunch 3–4 times a week.",
        goals: ["Quick, wholesome lunches", "Variety without decision fatigue"],
        painPoints: ["Oily, repetitive delivery food", "Unpredictable delivery times"],
        preferredChannels: ["Instagram", "WhatsApp", "Swiggy"],
      },
      {
        name: "Celebration-planner Raghav",
        snapshot: "34, planning his sister's wedding reception for 300 guests.",
        goals: ["Reliable catering with authentic food", "Transparent per-plate pricing"],
        painPoints: ["Caterers who over-promise", "Hidden charges"],
        preferredChannels: ["Google Search", "Instagram", "Referrals"],
      },
      {
        name: "Weekend-family Meera",
        snapshot: "41, takes her family out every other weekend.",
        goals: ["Kid-friendly yet authentic food", "Easy table bookings"],
        painPoints: ["Long weekend wait times", "Noisy venues"],
        preferredChannels: ["Instagram", "Google Maps", "Facebook"],
      },
    ],
    competitorInsights: [
      {
        competitor: "Bombay Brasserie Co.",
        strengths: ["High-production Instagram content", "Strong brand recall"],
        weaknesses: ["Premium pricing", "No catering offer"],
        opportunity: "Own the 'authentic regional catering' position they don't serve.",
      },
      {
        competitor: "Ghar Ka Khana Kitchens",
        strengths: ["Low prices", "Fast delivery"],
        weaknesses: ["Inconsistent quality reviews", "Weak visual identity"],
        opportunity: "Win quality-sensitive weekday orderers with a value combo.",
      },
    ],
    opportunities: [
      { title: "Search-led catering lead generation", rationale: "High-intent wedding catering searches peak Nov–Feb in Bengaluru.", impact: "high" },
      { title: "Process-driven short video", rationale: "Slow-cooking visuals differentiate the brand and perform well on Reels/Shorts.", impact: "high" },
      { title: "WhatsApp reorder loop", rationale: "Move repeat delivery customers to direct orders and save aggregator commission.", impact: "medium" },
    ],
    recommendedChannels: [
      { channel: "Instagram", role: "Brand, community and menu discovery", budgetSharePercent: 35, rationale: "Primary discovery channel for the core audience." },
      { channel: "Google Ads", role: "Catering and booking demand capture", budgetSharePercent: 35, rationale: "Captures high-intent catering searches." },
      { channel: "Facebook", role: "Family and event audiences", budgetSharePercent: 15, rationale: "Reaches older decision-makers for events." },
      { channel: "YouTube", role: "Process storytelling via Shorts", budgetSharePercent: 10, rationale: "Low-cost reach for differentiated video." },
      { channel: "WhatsApp", role: "Retention and reorders", budgetSharePercent: 5, rationale: "Owned channel for repeat customers." },
    ],
    strategy: {
      positioning: "Bengaluru's home for slow-cooked regional Indian food — for everyday meals and life's biggest celebrations.",
      pillars: [
        { name: "The slow way", description: "Craft, process and chef stories that prove the food is made the traditional way." },
        { name: "Everyday good food", description: "Weekday value, combos and dependable delivery." },
        { name: "Celebrate with us", description: "Catering, festive menus and event success stories." },
      ],
      objectives: [
        "+25% weekday delivery orders this quarter",
        "120 qualified catering leads per month",
        "Grow Instagram followers from 18k to 25k",
      ],
    },
    plan30Day: [
      { week: 1, theme: "Winter menu launch", actions: ["Carousel reveal", "Chef reel", "Google Ads for 'winter menu Bengaluru'"] },
      { week: 2, theme: "Catering proof", actions: ["Wedding case study post", "Lead form ads", "Testimonial stories"] },
      { week: 3, theme: "Weekday value", actions: ["₹299 lunch combo launch", "WhatsApp reorder broadcast", "Office-area geo ads"] },
      { week: 4, theme: "Festive pre-bookings", actions: ["Christmas brunch announcement", "Early-bird offer", "Influencer tasting"] },
    ],
  },
}

export const DEMO_BRAND_PROFILES: BrandProfile[] = [
  {
    id: "brand-primary",
    name: "Saffron & Sage — Primary",
    isDefault: true,
    logoAssetId: null,
    logoUrl: null,
    colors: [
      { name: "Saffron", hex: "#E4572E", role: "primary" },
      { name: "Sage", hex: "#7D9B76", role: "secondary" },
      { name: "Turmeric", hex: "#F2A541", role: "accent" },
      { name: "Charcoal", hex: "#2B2B2B", role: "neutral" },
      { name: "Rice paper", hex: "#FAF6EF", role: "background" },
    ],
    typography: {
      heading: "Fraunces",
      body: "Inter",
      notes: "Serif headings for warmth; never more than two typefaces in one creative.",
    },
    voice: {
      traits: ["Warm", "Proud of craft", "Unpretentious", "Generous"],
      description:
        "We talk like a host who loves feeding people: warm, specific about ingredients and process, never pretentious. Short sentences, sensory words, gentle humour.",
      doList: [
        "Name the dish, region and cooking method",
        "Mention the outlet or neighbourhood when relevant",
        "Use Hindi/Kannada food words naturally with context",
      ],
      dontList: ["Use 'best in town' or unverifiable superlatives", "Use more than 2 emojis per caption", "Shout in ALL CAPS"],
    },
    messaging: {
      tagline: "Slow-cooked. Made to share.",
      elevatorPitch:
        "Saffron & Sage serves slow-cooked regional Indian food across three Bengaluru neighbourhoods — for weeknight dinners, weekend feasts and celebrations of up to 500 guests.",
      keyMessages: [
        "Every curry is slow-cooked for at least 6 hours",
        "Regional recipes from our chefs' home kitchens",
        "Catering for 50–500 guests with transparent per-plate pricing",
      ],
    },
    approvedCopy: [
      "Slow-cooked since sunrise. Ready when you are.",
      "Celebrations taste better when nobody's rushing the food.",
    ],
    prohibitedMessaging: ["best in Bengaluru", "cheapest", "guaranteed", "100% healthy"],
    visualReferences: [
      "Overhead shots on dark wood or brass thalis",
      "Natural window light, warm tones, visible steam",
      "Hands serving and sharing — people, not plated perfection",
    ],
    guidelines:
      "Logo always on rice paper or charcoal backgrounds. Keep 20% clear space around food hero images. Price callouts use Turmeric on Charcoal.",
    updatedAt: "2026-11-01T10:00:00.000Z",
  },
  {
    id: "brand-catering",
    name: "Saffron & Sage Catering",
    isDefault: false,
    logoAssetId: null,
    logoUrl: null,
    colors: [
      { name: "Deep saffron", hex: "#C2452D", role: "primary" },
      { name: "Gold", hex: "#C9A227", role: "accent" },
      { name: "Ivory", hex: "#FFFDF7", role: "background" },
    ],
    typography: { heading: "Fraunces", body: "Inter", notes: "More formal, generous spacing." },
    voice: {
      traits: ["Reassuring", "Professional", "Celebratory"],
      description: "Calm, precise and celebratory. We reassure planners that the food is one thing they won't have to worry about.",
      doList: ["Quote guest counts and menus precisely", "Lead with reliability"],
      dontList: ["Use slang", "Make delivery-time promises"],
    },
    messaging: {
      tagline: "Your celebration, slow-cooked to perfection.",
      elevatorPitch: "Full-service wedding and event catering for 50–500 guests across Bengaluru.",
      keyMessages: ["Transparent per-plate pricing", "Tasting session before you book"],
    },
    approvedCopy: [],
    prohibitedMessaging: ["cheapest", "guaranteed"],
    visualReferences: ["Banquet setups with warm lighting", "Live counters and chefs in action"],
    guidelines: "",
    updatedAt: "2026-10-20T10:00:00.000Z",
  },
]
