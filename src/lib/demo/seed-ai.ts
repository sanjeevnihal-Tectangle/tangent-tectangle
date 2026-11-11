import type { ApprovalView } from "@/lib/domain/approvals"
import type { Conversation } from "@/lib/domain/conversations"

export const DEMO_APPROVALS: (ApprovalView & { payload: Record<string, string> })[] = [
  {
    id: "apr-demo-1",
    version: 1,
    actionType: "publish_post",
    title: "Publish 'Winter menu reveal' carousel",
    account: { provider: "Instagram", name: "@saffronandsage.blr", connected: false },
    details: [
      { label: "Format", value: "Carousel · 5 slides · 1080×1350" },
      { label: "Caption", value: "Slow-cooked since sunrise. Our winter menu is here — nihari, sarson da saag, and four more dishes that need a cold evening. Swipe to pick your favourite →" },
      { label: "Hashtags", value: "#SaffronAndSage #BengaluruFood #WinterMenu #Indiranagar" },
      { label: "Publish time", value: "Tomorrow, 12:00 PM IST" },
    ],
    payload: {
      format: "carousel",
      caption: "Slow-cooked since sunrise. Our winter menu is here — nihari, sarson da saag, and four more dishes that need a cold evening. Swipe to pick your favourite →",
      hashtags: "#SaffronAndSage #BengaluruFood #WinterMenu #Indiranagar",
      publishAt: "tomorrow-12:00-IST",
    },
    financialImpact: null,
    requestedByAgent: "Copywriter",
    requestedAt: "2026-11-10T08:10:00.000Z",
    status: "pending",
    decisionNote: null,
    isSample: true,
  },
  {
    id: "apr-demo-2",
    version: 1,
    actionType: "increase_budget",
    title: "Increase Wedding Catering daily budget",
    account: { provider: "Google Ads", name: "Saffron & Sage — Search", connected: false },
    details: [
      { label: "Campaign", value: "Wedding Season Catering — Search" },
      { label: "Current daily budget", value: "₹2,000" },
      { label: "Proposed daily budget", value: "₹2,800 (+40%)" },
      { label: "Reason", value: "Search leads cost 31% less than Meta over 14 days; campaign is budget-limited 6 of 7 days." },
    ],
    payload: { campaign: "wedding-catering-search", currentDailyBudgetInr: "2000", proposedDailyBudgetInr: "2800" },
    financialImpact: { currency: "INR", maxSpendPaise: 800_00, period: "daily" },
    requestedByAgent: "Marketing Strategist",
    requestedAt: "2026-11-10T06:40:00.000Z",
    status: "pending",
    decisionNote: null,
    isSample: true,
  },
]

export const DEMO_CONVERSATIONS: Conversation[] = [
  {
    id: "conv-demo-1",
    title: "Instagram captions for the winter menu",
    updatedAt: "2026-11-10T08:05:00.000Z",
    isSample: true,
    messages: [
      {
        id: "msg-demo-1",
        role: "user",
        text: "Create 3 Instagram captions and a visual concept for our winter comfort menu launch.",
        createdAt: "2026-11-10T08:02:00.000Z",
        run: null,
      },
      {
        id: "msg-demo-2",
        role: "assistant",
        createdAt: "2026-11-10T08:05:00.000Z",
        text:
          "Here are three on-brand caption options and a carousel concept for the winter menu launch.\n\n- **Option 1** leads with process (slow-cooking), which is your strongest differentiator.\n- **Option 2** targets weekday delivery customers.\n- **Option 3** is built for the weekend family audience.\n\nAll three passed the brand check. Publishing to Instagram needs a connected account and your approval — nothing has been posted.",
        run: {
          runId: "run-demo-1",
          status: "completed",
          intent: "Write launch captions and a visual concept for the winter comfort menu on Instagram.",
          taskType: "content_creation",
          steps: [
            { id: "s1", agentId: "copywriter", title: "Draft 3 Instagram captions" },
            { id: "s2", agentId: "graphic_designer", title: "Develop a carousel visual concept" },
          ],
          contextSources: [
            { label: "Business profile", detail: "Saffron & Sage · Restaurants & food · Bengaluru" },
            { label: "Brand profile", detail: "Saffron & Sage — Primary" },
            { label: "Active campaign", detail: "Winter Comfort Menu Launch" },
          ],
          outputs: [
            {
              stepId: "s1",
              agentId: "copywriter",
              title: "Draft 3 Instagram captions",
              output: {
                kind: "copy",
                data: {
                  brief: "Launch the winter comfort menu with warm, process-led captions.",
                  notes: ["Keep emojis to two or fewer per caption, per brand voice."],
                  variants: [
                    {
                      platform: "Instagram",
                      format: "Carousel caption",
                      headline: "Slow-cooked since sunrise",
                      body: "Our winter menu is here. Nihari that simmers for 8 hours, sarson da saag churned by hand, and four more dishes that need a cold Bengaluru evening. Swipe to pick yours →",
                      callToAction: "Book a table at Indiranagar, Koramangala or HSR",
                      hashtags: ["#SaffronAndSage", "#BengaluruFood", "#WinterMenu"],
                      suggestedDate: "",
                    },
                    {
                      platform: "Instagram",
                      format: "Feed post caption",
                      headline: "Winter, delivered",
                      body: "Long day? The nihari's been slow-cooking since before your first meeting. Our winter menu is now on Swiggy and Zomato.",
                      callToAction: "Order tonight — link in bio",
                      hashtags: ["#SaffronAndSage", "#WinterComfort", "#BengaluruEats"],
                      suggestedDate: "",
                    },
                    {
                      platform: "Instagram",
                      format: "Reel caption",
                      headline: "Made to share",
                      body: "Some dishes are meant for the whole table. Bring the family this weekend and try the new winter thali — slow-cooked, generous and made to share.",
                      callToAction: "Reserve your weekend table",
                      hashtags: ["#SaffronAndSage", "#FamilyDinner", "#WinterThali"],
                      suggestedDate: "",
                    },
                  ],
                },
              },
            },
            {
              stepId: "s2",
              agentId: "graphic_designer",
              title: "Develop a carousel visual concept",
              output: {
                kind: "creative",
                data: {
                  notes: ["Image generation is not configured; concepts include ready-to-use prompts."],
                  concepts: [
                    {
                      name: "Steam & brass",
                      platform: "Instagram",
                      format: "Carousel (5 slides)",
                      aspectRatio: "4:5",
                      visualDirection: "Overhead shots on brass thalis over dark wood, visible steam, warm window light.",
                      composition: "Slide 1 hero dish centred with 20% clear space top for the headline; slides 2–5 one dish each.",
                      colorUsage: ["Saffron #E4572E headline", "Rice paper #FAF6EF text panel", "Charcoal #2B2B2B background accents"],
                      copyOverlay: "Slide 1: 'Slow-cooked since sunrise' · Slides 2–5: dish name + region",
                      imagePrompt: "Overhead food photograph of slow-cooked mutton nihari in a brass bowl on dark wood, steam rising, warm natural window light, rustic Indian table setting, shallow depth of field, editorial style",
                    },
                  ],
                },
              },
            },
          ],
          validation: [
            { label: "Output schema", status: "pass", detail: "All agent outputs matched their schemas." },
            { label: "Prohibited messaging", status: "pass", detail: "No prohibited phrases found." },
            { label: "Brand voice", status: "pass", detail: "Emoji and superlative rules respected." },
          ],
          actions: [
            {
              actionType: "publish_post",
              platform: "Instagram",
              description: "Publish the winter menu carousel",
              state: "connection_required",
            },
          ],
          limitations: [],
          error: null,
          durationMs: 21400,
        },
      },
    ],
  },
  {
    id: "conv-demo-2",
    title: "Christmas brunch campaign ideas",
    updatedAt: "2026-11-09T15:20:00.000Z",
    isSample: true,
    messages: [
      {
        id: "msg-demo-3",
        role: "user",
        text: "Create a campaign strategy for Christmas & New Year brunch pre-bookings with a ₹90,000 budget.",
        createdAt: "2026-11-09T15:15:00.000Z",
        run: null,
      },
      {
        id: "msg-demo-4",
        role: "assistant",
        createdAt: "2026-11-09T15:20:00.000Z",
        text:
          "I've prepared a 6-week pre-booking strategy split into a teaser, early-bird and last-tables phase. Most of the budget goes to Instagram and Google Search where booking intent is highest.\n\nNext step: approve the strategy, then I can draft the creatives and ad copy for phase one.",
        run: {
          runId: "run-demo-2",
          status: "completed",
          intent: "Plan a pre-booking campaign for festive brunches with a ₹90,000 budget.",
          taskType: "campaign_planning",
          steps: [{ id: "s1", agentId: "marketing_strategist", title: "Build the pre-booking campaign strategy" }],
          contextSources: [
            { label: "Business profile", detail: "Saffron & Sage · Restaurants & food · Bengaluru" },
            { label: "Brand profile", detail: "Saffron & Sage — Primary" },
          ],
          outputs: [
            {
              stepId: "s1",
              agentId: "marketing_strategist",
              title: "Build the pre-booking campaign strategy",
              output: {
                kind: "strategy",
                data: {
                  title: "Festive Brunch Pre-bookings",
                  summary: "Sell out Christmas and New Year brunch seatings across three outlets by opening pre-bookings early, rewarding early planners and using scarcity in the final fortnight.",
                  objectives: [
                    { objective: "Fill festive brunch seatings", kpi: "Pre-booked covers", target: "1,200 covers" },
                    { objective: "Efficient acquisition", kpi: "Cost per booking", target: "≤ ₹75" },
                  ],
                  pillars: [
                    { name: "Teaser", description: "Reveal the festive brunch menu dish by dish.", exampleIdeas: ["Menu reveal carousel", "Chef's plum cake reel"] },
                    { name: "Early-bird", description: "Reward planners who book before 15 December.", exampleIdeas: ["Complimentary mocktail for early bookings"] },
                    { name: "Last tables", description: "Scarcity messaging by outlet.", exampleIdeas: ["'12 tables left in Indiranagar' stories"] },
                  ],
                  channelPlan: [
                    { channel: "Instagram", role: "Menu discovery and stories", budgetSharePercent: 40, cadence: "5 posts + daily stories per week" },
                    { channel: "Google Ads", role: "Capture 'Christmas brunch Bengaluru' searches", budgetSharePercent: 40, cadence: "Always on" },
                    { channel: "YouTube", role: "Chef Shorts", budgetSharePercent: 20, cadence: "2 Shorts per week" },
                  ],
                  timeline: [
                    { period: "Weeks 1–2", focus: "Teaser", actions: ["Menu reveal", "Waitlist sign-ups"] },
                    { period: "Weeks 3–4", focus: "Early-bird", actions: ["Open bookings", "Search campaign live"] },
                    { period: "Weeks 5–6", focus: "Last tables", actions: ["Scarcity stories", "Retargeting"] },
                  ],
                  risks: ["Seatings may sell out unevenly across outlets — monitor daily and shift spend."],
                  nextSteps: ["Approve strategy", "Generate phase 1 creatives", "Prepare Google Ads structure for approval"],
                },
              },
            },
          ],
          validation: [
            { label: "Output schema", status: "pass", detail: "All agent outputs matched their schemas." },
            { label: "Budget", status: "pass", detail: "Channel allocation sums to 100%." },
          ],
          actions: [],
          limitations: [],
          error: null,
          durationMs: 18200,
        },
      },
    ],
  },
]
