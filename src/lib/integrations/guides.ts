export interface EnvFieldDefinition {
  key: string
  label: string
  placeholder: string
  secret: boolean
  helpText: string
}

export interface DirectConnectSpec {
  accountNameLabel: string
  accountNamePlaceholder: string
  externalIdLabel: string
  externalIdPlaceholder: string
  tokenLabel: string
  tokenPlaceholder: string
  tokenHelp: string
  supportsLiveVerification: boolean
  isAdAccount?: boolean
}

export interface McpConnectionSpec {
  serverName: string
  packageName: string
  npxCommand: string
  defaultEndpointPlaceholder: string
  documentationUrl: string
  availableTools: string[]
  steps: {
    title: string
    description: string
  }[]
}

export interface IntegrationGuide {
  id: string
  developerPortalName: string
  developerPortalUrl: string
  estimatedMinutes: string
  summary: string
  steps: {
    title: string
    description: string
  }[]
  requiredScopes: string[]
  envFields: EnvFieldDefinition[]
  directConnect: DirectConnectSpec | null
  mcp: McpConnectionSpec
}

export const INTEGRATION_GUIDES: Record<string, IntegrationGuide> = {
  openai: {
    id: "openai",
    developerPortalName: "OpenAI Platform — API Keys",
    developerPortalUrl: "https://platform.openai.com/api-keys",
    estimatedMinutes: "2 min",
    summary:
      "Connect OpenAI to run GPT reasoning models across your 11 AI marketing agents and generate brand images with gpt-image-2.6-sunburst.",
    steps: [
      {
        title: "Open the OpenAI API Keys dashboard",
        description:
          "Sign in at platform.openai.com/api-keys and select your project or organization.",
      },
      {
        title: "Create a new secret key",
        description:
          "Click 'Create new secret key', name it 'Tangent Marketing OS', and grant All or Responses/Images permissions.",
      },
      {
        title: "Paste the key below",
        description:
          "Paste the sk-... key into OPENAI_API_KEY below and click Save Server Credentials. Tangent automatically fails over between OpenAI and Anthropic.",
      },
    ],
    requiredScopes: ["v1/responses", "v1/images/generations"],
    envFields: [
      {
        key: "OPENAI_API_KEY",
        label: "OpenAI API Key (OPENAI_API_KEY)",
        placeholder: "sk-proj-...",
        secret: true,
        helpText: "Stored server-side only; never exposed to the browser.",
      },
    ],
    directConnect: null,
    mcp: {
      serverName: "OpenAI Responses MCP Bridge",
      packageName: "@modelcontextprotocol/server-openai",
      npxCommand: "npx -y @modelcontextprotocol/inspector npx @openai/mcp-server",
      defaultEndpointPlaceholder: "https://mcp.yourdomain.com/openai/sse",
      documentationUrl: "https://platform.openai.com/docs/guides/tools-remote-mcp",
      availableTools: [
        "openai_responses_generate",
        "openai_image_generate",
        "openai_web_search_preview",
      ],
      steps: [
        {
          title: "Choose Remote MCP URL or Stdio Package",
          description:
            "OpenAI supports native Remote MCP servers in the Responses API as well as local stdio MCP bridges.",
        },
        {
          title: "Provide MCP Endpoint or Command",
          description:
            "Enter your hosted MCP SSE/HTTP URL or use the pre-filled npx command in Step 2, along with an optional bearer token.",
        },
      ],
    },
  },

  anthropic: {
    id: "anthropic",
    developerPortalName: "Anthropic Console — API Keys",
    developerPortalUrl: "https://console.anthropic.com/settings/keys",
    estimatedMinutes: "2 min",
    summary:
      "Connect Anthropic Claude (Sonnet & Haiku) for structured agent outputs, brand-safe copywriting, and automatic failover with OpenAI.",
    steps: [
      {
        title: "Open Anthropic Console",
        description:
          "Sign in at console.anthropic.com/settings/keys and verify your workspace has active credits.",
      },
      {
        title: "Create an API Key",
        description:
          "Click 'Create Key', name it 'Tangent Marketing OS', and copy the sk-ant-... secret.",
      },
      {
        title: "Save to Tangent",
        description:
          "Paste the key below and click Save Server Credentials. All 11 agents will immediately use Claude.",
      },
    ],
    requiredScopes: ["v1/messages (structured outputs)"],
    envFields: [
      {
        key: "ANTHROPIC_API_KEY",
        label: "Anthropic API Key (ANTHROPIC_API_KEY)",
        placeholder: "sk-ant-api03-...",
        secret: true,
        helpText: "Stored server-side only; never exposed to the browser.",
      },
    ],
    directConnect: null,
    mcp: {
      serverName: "Anthropic Native MCP Connector",
      packageName: "@modelcontextprotocol/sdk",
      npxCommand: "npx -y @modelcontextprotocol/inspector",
      defaultEndpointPlaceholder: "https://mcp.yourdomain.com/anthropic/sse",
      documentationUrl: "https://docs.anthropic.com/en/docs/agents-and-tools/mcp-connector",
      availableTools: [
        "claude_mcp_tool_runner",
        "claude_structured_strategy",
        "claude_brand_guardrail_check",
      ],
      steps: [
        {
          title: "Anthropic Messages API MCP Connector",
          description:
            "Anthropic created the Model Context Protocol (MCP) and supports connecting remote SSE/Streamable HTTP MCP servers directly in Messages API calls.",
        },
        {
          title: "Register MCP Server in Tangent",
          description:
            "Link your MCP server URL or stdio command in Step 2 so Claude agents can invoke its tools under Tangent's approval guardrails.",
        },
      ],
    },
  },

  instagram: {
    id: "instagram",
    developerPortalName: "Meta for Developers — My Apps",
    developerPortalUrl: "https://developers.facebook.com/apps",
    estimatedMinutes: "5 min",
    summary:
      "Connect Instagram Business or Creator accounts via Meta Graph API or MCP for approval-gated Reels, carousels, posts, and insights.",
    steps: [
      {
        title: "Create a Business App in Meta for Developers",
        description:
          "Go to developers.facebook.com/apps → Create App → select 'Other' → 'Business', and link your Meta Business Portfolio.",
      },
      {
        title: "Add Facebook Login for Business & Instagram Graph API",
        description:
          "In your Meta App dashboard, add 'Facebook Login for Business' and paste the OAuth Redirect URI shown below into 'Valid OAuth Redirect URIs'.",
      },
      {
        title: "Copy App ID & App Secret (or use a System User Token)",
        description:
          "Under App Settings → Basic, copy your App ID and App Secret into the fields below to enable 1-click OAuth, OR connect via Direct Token / MCP.",
      },
    ],
    requiredScopes: [
      "instagram_basic",
      "instagram_content_publish",
      "instagram_manage_insights",
      "pages_show_list",
      "pages_read_engagement",
    ],
    envFields: [
      {
        key: "META_APP_ID",
        label: "Meta App ID (META_APP_ID)",
        placeholder: "e.g. 109283746519283",
        secret: false,
        helpText: "Shared across Instagram, Facebook Pages, and Meta Ads.",
      },
      {
        key: "META_APP_SECRET",
        label: "Meta App Secret (META_APP_SECRET)",
        placeholder: "32-character hex secret",
        secret: true,
        helpText: "Found in Meta App Dashboard → App Settings → Basic.",
      },
    ],
    directConnect: {
      accountNameLabel: "Instagram Handle / Display Name",
      accountNamePlaceholder: "e.g. @saffronandsage.in",
      externalIdLabel: "Instagram Business Account ID (IG User ID)",
      externalIdPlaceholder: "e.g. 17841405822304914",
      tokenLabel: "Meta Access Token / System User Token (optional for sandbox, verified if provided)",
      tokenPlaceholder: "EAABsbCS1iHgBO...",
      tokenHelp:
        "Generate in Meta Business Settings → System Users → Generate New Token with instagram_basic & instagram_content_publish.",
      supportsLiveVerification: true,
    },
    mcp: {
      serverName: "Instagram Graph MCP Server",
      packageName: "mcp-server-instagram",
      npxCommand: "npx -y @missionsquad/mcp-instagram",
      defaultEndpointPlaceholder: "https://mcp.yourdomain.com/instagram/sse",
      documentationUrl: "https://modelcontextprotocol.io/examples",
      availableTools: [
        "ig_get_business_profile",
        "ig_list_media_insights",
        "ig_create_media_container",
        "ig_publish_approved_reel",
      ],
      steps: [
        {
          title: "Run or Host an Instagram MCP Server",
          description:
            "Use the Instagram Graph MCP package locally via npx, or connect a hosted MCP SSE endpoint (e.g. via n8n MCP Trigger, Composio, or Smithery).",
        },
        {
          title: "Link MCP Endpoint & Token",
          description:
            "In Step 2, choose Remote HTTP/SSE or Stdio Command, paste your Instagram access token (encrypted with AES-256-GCM), and connect.",
        },
      ],
    },
  },

  facebook: {
    id: "facebook",
    developerPortalName: "Meta for Developers — My Apps",
    developerPortalUrl: "https://developers.facebook.com/apps",
    estimatedMinutes: "4 min",
    summary:
      "Connect Facebook Pages via OAuth, Token, or MCP to schedule posts, publish brand updates, and read Page engagement metrics.",
    steps: [
      {
        title: "Configure Facebook Login in your Meta App",
        description:
          "Open your Meta Business App at developers.facebook.com/apps and add the OAuth Redirect URI below under Facebook Login → Settings → Valid OAuth Redirect URIs.",
      },
      {
        title: "Grant Page publishing & engagement permissions",
        description:
          "Ensure pages_show_list, pages_manage_posts, pages_read_engagement, and read_insights are enabled for your app.",
      },
      {
        title: "Connect via OAuth, MCP, or Page Access Token",
        description:
          "Save META_APP_ID and META_APP_SECRET below to launch OAuth, or connect a Facebook Page directly via Token or MCP.",
      },
    ],
    requiredScopes: [
      "pages_show_list",
      "pages_manage_posts",
      "pages_read_engagement",
      "read_insights",
    ],
    envFields: [
      {
        key: "META_APP_ID",
        label: "Meta App ID (META_APP_ID)",
        placeholder: "e.g. 109283746519283",
        secret: false,
        helpText: "Shared across Instagram, Facebook Pages, and Meta Ads.",
      },
      {
        key: "META_APP_SECRET",
        label: "Meta App Secret (META_APP_SECRET)",
        placeholder: "32-character hex secret",
        secret: true,
        helpText: "Found in Meta App Dashboard → App Settings → Basic.",
      },
    ],
    directConnect: {
      accountNameLabel: "Facebook Page Name",
      accountNamePlaceholder: "e.g. Saffron & Sage Bengaluru",
      externalIdLabel: "Facebook Page ID",
      externalIdPlaceholder: "e.g. 104928173645102",
      tokenLabel: "Page Access Token (encrypted with AES-256-GCM)",
      tokenPlaceholder: "EAABsbCS1iHgBO...",
      tokenHelp:
        "Paste a long-lived Page Access Token or System User token to verify against Graph API.",
      supportsLiveVerification: true,
    },
    mcp: {
      serverName: "Facebook Pages Graph MCP Server",
      packageName: "@missionsquad/mcp-meta-pages",
      npxCommand: "npx -y @missionsquad/mcp-meta-pages",
      defaultEndpointPlaceholder: "https://mcp.yourdomain.com/facebook-pages/sse",
      documentationUrl: "https://modelcontextprotocol.io/examples",
      availableTools: [
        "fb_list_managed_pages",
        "fb_get_page_insights",
        "fb_read_page_feed",
        "fb_publish_approved_post",
      ],
      steps: [
        {
          title: "Start Facebook Pages MCP Server",
          description:
            "Run the Meta Pages MCP server via npx or expose a Facebook Graph MCP workflow in n8n / remote MCP gateway.",
        },
        {
          title: "Connect MCP Server to Workspace",
          description:
            "Select your transport in Step 2 and attach your Page Access Token so Social Media & Analytics agents can query Page metrics.",
        },
      ],
    },
  },

  youtube: {
    id: "youtube",
    developerPortalName: "Google Cloud Console — Credentials",
    developerPortalUrl: "https://console.cloud.google.com/apis/credentials",
    estimatedMinutes: "5 min",
    summary:
      "Connect YouTube channels via OAuth, Token, or MCP to upload Shorts and long-form videos and ingest channel analytics.",
    steps: [
      {
        title: "Enable YouTube Data API v3 & YouTube Analytics API",
        description:
          "In Google Cloud Console → APIs & Services → Library, enable 'YouTube Data API v3' and 'YouTube Analytics API'.",
      },
      {
        title: "Create an OAuth 2.0 Web Client",
        description:
          "Go to Credentials → Create Credentials → OAuth client ID → Web application, and paste the Redirect URI shown below into 'Authorized redirect URIs'.",
      },
      {
        title: "Save Client ID & Secret or Connect via MCP / Token",
        description:
          "Enter GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET below to enable 1-click Google OAuth, or register your channel via Direct Connect or MCP.",
      },
    ],
    requiredScopes: [
      "https://www.googleapis.com/auth/youtube.upload",
      "https://www.googleapis.com/auth/youtube.readonly",
      "https://www.googleapis.com/auth/yt-analytics.readonly",
    ],
    envFields: [
      {
        key: "GOOGLE_CLIENT_ID",
        label: "Google OAuth Client ID (GOOGLE_CLIENT_ID)",
        placeholder: "1234567890-abc.apps.googleusercontent.com",
        secret: false,
        helpText: "Shared across YouTube, Google Ads, and Search Console.",
      },
      {
        key: "GOOGLE_CLIENT_SECRET",
        label: "Google OAuth Client Secret (GOOGLE_CLIENT_SECRET)",
        placeholder: "GOCSPX-...",
        secret: true,
        helpText: "From Google Cloud Console → Credentials.",
      },
    ],
    directConnect: {
      accountNameLabel: "YouTube Channel Name",
      accountNamePlaceholder: "e.g. Saffron & Sage Roasters",
      externalIdLabel: "YouTube Channel ID",
      externalIdPlaceholder: "e.g. UC_x5XG1OV2P6uZZ5FSM9Ttw",
      tokenLabel: "Google OAuth Bearer Token (optional for sandbox)",
      tokenPlaceholder: "ya29.a0AfB_by...",
      tokenHelp: "If provided, Tangent verifies your channel via YouTube Data API v3.",
      supportsLiveVerification: true,
    },
    mcp: {
      serverName: "YouTube Data & Transcripts MCP Server",
      packageName: "@kimtaeyoon83/mcp-server-youtube",
      npxCommand: "npx -y @kimtaeyoon83/mcp-server-youtube",
      defaultEndpointPlaceholder: "https://mcp.yourdomain.com/youtube/sse",
      documentationUrl: "https://modelcontextprotocol.io/examples",
      availableTools: [
        "yt_get_channel_stats",
        "yt_list_recent_videos",
        "yt_get_video_transcript",
        "yt_upload_approved_short",
      ],
      steps: [
        {
          title: "Launch YouTube MCP Server",
          description:
            "Use @kimtaeyoon83/mcp-server-youtube via npx or connect a remote SSE MCP server with your YouTube Data API key / OAuth token.",
        },
        {
          title: "Register MCP Endpoint in Step 2",
          description:
            "Link the MCP server to enable Video Producer and Market Research agents to inspect channel stats and video performance.",
        },
      ],
    },
  },

  linkedin: {
    id: "linkedin",
    developerPortalName: "LinkedIn Developer Portal",
    developerPortalUrl: "https://www.linkedin.com/developers/apps",
    estimatedMinutes: "4 min",
    summary:
      "Connect LinkedIn company pages and executive profiles via OAuth, Token, or MCP for B2B publishing and analytics.",
    steps: [
      {
        title: "Create an App in LinkedIn Developer Portal",
        description:
          "Open linkedin.com/developers/apps → Create app, associate your LinkedIn Company Page, and verify it.",
      },
      {
        title: "Enable 'Share on LinkedIn' & 'Sign In with LinkedIn using OpenID Connect'",
        description:
          "Under the Products tab, request access to 'Share on LinkedIn' and 'Sign In with LinkedIn using OpenID Connect'.",
      },
      {
        title: "Add Redirect URL & Save Credentials",
        description:
          "Under the Auth tab, add the OAuth 2.0 Redirect URL below, then paste your Client ID and Primary Client Secret.",
      },
    ],
    requiredScopes: ["openid", "profile", "w_member_social"],
    envFields: [
      {
        key: "LINKEDIN_CLIENT_ID",
        label: "LinkedIn Client ID (LINKEDIN_CLIENT_ID)",
        placeholder: "e.g. 86abc123def456",
        secret: false,
        helpText: "From LinkedIn Developer Portal → Auth tab.",
      },
      {
        key: "LINKEDIN_CLIENT_SECRET",
        label: "LinkedIn Client Secret (LINKEDIN_CLIENT_SECRET)",
        placeholder: "WPL_AP1....",
        secret: true,
        helpText: "Primary Client Secret from the Auth tab.",
      },
    ],
    directConnect: {
      accountNameLabel: "LinkedIn Page / Profile Name",
      accountNamePlaceholder: "e.g. Saffron & Sage Official",
      externalIdLabel: "Organization URN or Member ID",
      externalIdPlaceholder: "e.g. urn:li:organization:98765432",
      tokenLabel: "LinkedIn OAuth 2.0 Access Token (optional)",
      tokenPlaceholder: "AQV...",
      tokenHelp: "Can be generated in LinkedIn Developer Portal → Auth → OAuth 2.0 tools.",
      supportsLiveVerification: true,
    },
    mcp: {
      serverName: "LinkedIn Marketing & Posts MCP Server",
      packageName: "@stickerdaniel/linkedin-mcp-server",
      npxCommand: "npx -y @stickerdaniel/linkedin-mcp-server",
      defaultEndpointPlaceholder: "https://mcp.yourdomain.com/linkedin/sse",
      documentationUrl: "https://modelcontextprotocol.io/examples",
      availableTools: [
        "linkedin_get_company_profile",
        "linkedin_list_organization_posts",
        "linkedin_get_share_statistics",
        "linkedin_create_approved_post",
      ],
      steps: [
        {
          title: "Configure LinkedIn MCP Server",
          description:
            "Run the LinkedIn MCP server via npx or connect a remote MCP SSE endpoint configured with your LinkedIn OAuth token.",
        },
        {
          title: "Bind to Tangent Workspace",
          description:
            "Complete Step 2 to allow Social Media and Copywriter agents to read organization posts and prepare B2B drafts.",
        },
      ],
    },
  },

  tiktok: {
    id: "tiktok",
    developerPortalName: "TikTok for Developers",
    developerPortalUrl: "https://developers.tiktok.com/apps",
    estimatedMinutes: "5 min",
    summary:
      "Connect TikTok accounts via OAuth, Token, or MCP for short-form video publishing and creator performance metrics.",
    steps: [
      {
        title: "Create an App on TikTok for Developers",
        description:
          "Go to developers.tiktok.com/apps, create a Web app, and add 'Login Kit' and 'Content Posting API'.",
      },
      {
        title: "Register Redirect URI",
        description:
          "In Login Kit settings, add the Redirect URI shown below.",
      },
      {
        title: "Copy Client Key & Client Secret",
        description:
          "Paste TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET below or connect an account directly via Token or MCP.",
      },
    ],
    requiredScopes: ["user.info.basic", "video.publish", "video.upload"],
    envFields: [
      {
        key: "TIKTOK_CLIENT_KEY",
        label: "TikTok Client Key (TIKTOK_CLIENT_KEY)",
        placeholder: "aw1234567890...",
        secret: false,
        helpText: "From TikTok Developer Portal → Basic Information.",
      },
      {
        key: "TIKTOK_CLIENT_SECRET",
        label: "TikTok Client Secret (TIKTOK_CLIENT_SECRET)",
        placeholder: "32-char secret",
        secret: true,
        helpText: "Stored server-side only.",
      },
    ],
    directConnect: {
      accountNameLabel: "TikTok Handle",
      accountNamePlaceholder: "e.g. @saffronandsage",
      externalIdLabel: "TikTok Open ID / Account ID",
      externalIdPlaceholder: "e.g. _000abc123def",
      tokenLabel: "TikTok Access Token (optional)",
      tokenPlaceholder: "act.12345...",
      tokenHelp: "Encrypted with AES-256-GCM before storage.",
      supportsLiveVerification: true,
    },
    mcp: {
      serverName: "TikTok Creator & Content MCP Server",
      packageName: "@seym0n/tiktok-mcp",
      npxCommand: "npx -y @seym0n/tiktok-mcp",
      defaultEndpointPlaceholder: "https://mcp.yourdomain.com/tiktok/sse",
      documentationUrl: "https://modelcontextprotocol.io/examples",
      availableTools: [
        "tiktok_get_creator_info",
        "tiktok_list_videos",
        "tiktok_get_video_metrics",
        "tiktok_publish_approved_video",
      ],
      steps: [
        {
          title: "Start TikTok MCP Bridge",
          description:
            "Use the TikTok MCP package via npx or a remote MCP server connected to TikTok Content Posting API.",
        },
        {
          title: "Save MCP Connection in Step 2",
          description:
            "Provide your MCP endpoint or stdio command and optional TikTok access token.",
        },
      ],
    },
  },

  meta_ads: {
    id: "meta_ads",
    developerPortalName: "Meta Business Suite & Marketing API",
    developerPortalUrl: "https://developers.facebook.com/apps",
    estimatedMinutes: "5 min",
    summary:
      "Connect Meta Ad Accounts via OAuth, Token, or Meta Ads MCP Server for campaigns, spend caps, and human-approved ad launches.",
    steps: [
      {
        title: "Enable Marketing API in your Meta App",
        description:
          "In developers.facebook.com/apps, add the 'Marketing API' product to your Meta Business app.",
      },
      {
        title: "Add OAuth Redirect URI",
        description:
          "Ensure the Meta Ads callback URI below is listed in Facebook Login → Valid OAuth Redirect URIs.",
      },
      {
        title: "Connect via OAuth, Meta Ads MCP, or System User Token",
        description:
          "Save META_APP_ID and META_APP_SECRET below, or connect via Meta Ads MCP Server / Direct Token.",
      },
    ],
    requiredScopes: ["ads_management", "ads_read", "business_management"],
    envFields: [
      {
        key: "META_APP_ID",
        label: "Meta App ID (META_APP_ID)",
        placeholder: "e.g. 109283746519283",
        secret: false,
        helpText: "Shared across Instagram, Facebook Pages, and Meta Ads.",
      },
      {
        key: "META_APP_SECRET",
        label: "Meta App Secret (META_APP_SECRET)",
        placeholder: "32-character hex secret",
        secret: true,
        helpText: "Found in Meta App Dashboard → App Settings → Basic.",
      },
    ],
    directConnect: {
      accountNameLabel: "Meta Ad Account Name",
      accountNamePlaceholder: "e.g. Saffron & Sage — India Paid Social",
      externalIdLabel: "Meta Ad Account ID",
      externalIdPlaceholder: "e.g. act_1029384756",
      tokenLabel: "Marketing API System User Token (optional for sandbox)",
      tokenPlaceholder: "EAABsbCS1iHgBO...",
      tokenHelp:
        "Connecting a Meta Ad Account also adds it to Ads Manager so you can configure daily & monthly spend caps.",
      supportsLiveVerification: true,
      isAdAccount: true,
    },
    mcp: {
      serverName: "Meta Ads MCP Server (Pipeboard / Marketing API)",
      packageName: "meta-ads-mcp",
      npxCommand: "npx -y meta-ads-mcp",
      defaultEndpointPlaceholder: "https://mcp.yourdomain.com/meta-ads/sse",
      documentationUrl: "https://github.com/pipeboard-co/meta-ads-mcp",
      availableTools: [
        "mcp_meta_ads_get_ad_accounts",
        "mcp_meta_ads_get_campaigns",
        "mcp_meta_ads_get_insights",
        "mcp_meta_ads_create_campaign_draft",
      ],
      steps: [
        {
          title: "Run Meta Ads MCP Server",
          description:
            "Meta Ads has a dedicated MCP server (meta-ads-mcp) that lets AI agents inspect ROAS, ad sets, creatives, and campaign performance.",
        },
        {
          title: "Link MCP Server with Spend Guardrails",
          description:
            "In Step 2, enter the MCP command or URL and set your INR daily/monthly spend caps. Every ad launch still requires human sign-off.",
        },
      ],
    },
  },

  google_ads: {
    id: "google_ads",
    developerPortalName: "Google Ads API Center & Cloud Console",
    developerPortalUrl: "https://console.cloud.google.com/apis/credentials",
    estimatedMinutes: "5 min",
    summary:
      "Connect Google Ads customer accounts via OAuth, Token, or Google Ads MCP Server for Search & PMax campaigns.",
    steps: [
      {
        title: "Enable Google Ads API in Google Cloud Console",
        description:
          "Enable 'Google Ads API' in your Google Cloud project and configure OAuth credentials with the Redirect URI below.",
      },
      {
        title: "Copy your Google Ads Developer Token",
        description:
          "In your Google Ads Manager Account (MCC) → Tools & Settings → Setup → API Center, copy your Developer Token.",
      },
      {
        title: "Save Credentials or Connect via Google Ads MCP",
        description:
          "Save the 3 credentials below for OAuth, or connect via Google Ads MCP Server / Direct Customer ID.",
      },
    ],
    requiredScopes: ["https://www.googleapis.com/auth/adwords"],
    envFields: [
      {
        key: "GOOGLE_CLIENT_ID",
        label: "Google OAuth Client ID (GOOGLE_CLIENT_ID)",
        placeholder: "1234567890-abc.apps.googleusercontent.com",
        secret: false,
        helpText: "Shared across YouTube, Google Ads, and Search Console.",
      },
      {
        key: "GOOGLE_CLIENT_SECRET",
        label: "Google OAuth Client Secret (GOOGLE_CLIENT_SECRET)",
        placeholder: "GOCSPX-...",
        secret: true,
        helpText: "From Google Cloud Console → Credentials.",
      },
      {
        key: "GOOGLE_ADS_DEVELOPER_TOKEN",
        label: "Google Ads Developer Token (GOOGLE_ADS_DEVELOPER_TOKEN)",
        placeholder: "22-character developer token",
        secret: true,
        helpText: "From Google Ads Manager (MCC) → API Center.",
      },
    ],
    directConnect: {
      accountNameLabel: "Google Ads Account Name",
      accountNamePlaceholder: "e.g. Saffron & Sage — Search & PMax",
      externalIdLabel: "Google Ads Customer ID (10 digits)",
      externalIdPlaceholder: "e.g. 482-910-3847",
      tokenLabel: "Google OAuth Access / Refresh Token (optional)",
      tokenPlaceholder: "ya29.a0AfB_by...",
      tokenHelp:
        "Connecting a Google Ads account also registers it in Ads Manager with configurable daily and monthly spend limits.",
      supportsLiveVerification: false,
      isAdAccount: true,
    },
    mcp: {
      serverName: "Google Ads Official MCP Server",
      packageName: "@google-ads/mcp-server",
      npxCommand: "npx -y mcp-google-ads",
      defaultEndpointPlaceholder: "https://mcp.yourdomain.com/google-ads/sse",
      documentationUrl: "https://developers.google.com/google-ads/api/docs/start",
      availableTools: [
        "gads_list_accessible_customers",
        "gads_run_gaql_query",
        "gads_get_keyword_forecasts",
        "gads_create_approved_campaign",
      ],
      steps: [
        {
          title: "Launch Google Ads MCP Server",
          description:
            "Run the Google Ads MCP server to allow the Ads Manager and Analytics agents to execute read-only GAQL performance queries.",
        },
        {
          title: "Attach Customer ID & Spend Caps",
          description:
            "In Step 2, link your MCP server endpoint/command and configure daily and monthly INR spend limits.",
        },
      ],
    },
  },

  search_console: {
    id: "search_console",
    developerPortalName: "Google Cloud Console — Search Console API",
    developerPortalUrl: "https://console.cloud.google.com/apis/library/searchconsole.googleapis.com",
    estimatedMinutes: "3 min",
    summary:
      "Connect Google Search Console properties via OAuth, Token, or GSC MCP Server to unlock verified search queries, clicks, and rankings.",
    steps: [
      {
        title: "Enable Google Search Console API",
        description:
          "Open console.cloud.google.com and enable the 'Google Search Console API' on your project.",
      },
      {
        title: "Add Authorized Redirect URI",
        description:
          "Add the Search Console callback URI below to your Google OAuth 2.0 Web Client in Google Cloud Console.",
      },
      {
        title: "Connect via Google OAuth, GSC MCP, or Property URL",
        description:
          "Save GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET below to launch OAuth, or connect via GSC MCP Server.",
      },
    ],
    requiredScopes: ["https://www.googleapis.com/auth/webmasters.readonly"],
    envFields: [
      {
        key: "GOOGLE_CLIENT_ID",
        label: "Google OAuth Client ID (GOOGLE_CLIENT_ID)",
        placeholder: "1234567890-abc.apps.googleusercontent.com",
        secret: false,
        helpText: "Shared across YouTube, Google Ads, and Search Console.",
      },
      {
        key: "GOOGLE_CLIENT_SECRET",
        label: "Google OAuth Client Secret (GOOGLE_CLIENT_SECRET)",
        placeholder: "GOCSPX-...",
        secret: true,
        helpText: "From Google Cloud Console → Credentials.",
      },
    ],
    directConnect: {
      accountNameLabel: "Website Property Label",
      accountNamePlaceholder: "e.g. saffronandsage.in (Domain Property)",
      externalIdLabel: "Search Console Property URL / sc-domain",
      externalIdPlaceholder: "e.g. https://saffronandsage.in/ or sc-domain:saffronandsage.in",
      tokenLabel: "Google OAuth Bearer Token (optional)",
      tokenPlaceholder: "ya29.a0AfB_by...",
      tokenHelp:
        "Once connected, SEO Studio links your Search Console property directly to your audits and keyword briefs.",
      supportsLiveVerification: true,
    },
    mcp: {
      serverName: "Google Search Console MCP Server",
      packageName: "mcp-server-gsc",
      npxCommand: "npx -y mcp-server-gsc",
      defaultEndpointPlaceholder: "https://mcp.yourdomain.com/gsc/sse",
      documentationUrl: "https://github.com/ahonn/mcp-server-gsc",
      availableTools: [
        "gsc_list_sites",
        "gsc_search_analytics",
        "gsc_inspect_url_index",
        "gsc_list_sitemaps",
      ],
      steps: [
        {
          title: "Run Google Search Console MCP (`mcp-server-gsc`)",
          description:
            "The GSC MCP server exposes live search analytics, top queries, CTR, average position, and URL indexing inspection to the SEO Specialist agent.",
        },
        {
          title: "Connect GSC MCP Server in Step 2",
          description:
            "Choose Stdio (`npx -y mcp-server-gsc`) or your remote SSE URL and click Connect MCP Server.",
        },
      ],
    },
  },

  n8n: {
    id: "n8n",
    developerPortalName: "n8n Settings — API & MCP Server Trigger",
    developerPortalUrl: "https://docs.n8n.io/advanced-ai/examples/using-n8n-mcp-server/",
    estimatedMinutes: "2 min",
    summary:
      "Connect your n8n instance via REST API or native n8n MCP Server Trigger to run custom workflows from Tangent.",
    steps: [
      {
        title: "Open your n8n instance settings or MCP Server Trigger node",
        description:
          "In your n8n dashboard, navigate to Settings → n8n API, OR add an 'MCP Server Trigger' node to any n8n workflow.",
      },
      {
        title: "Copy your n8n MCP SSE URL or API Key",
        description:
          "Copy the production SSE URL from your n8n MCP Server Trigger node (e.g. https://n8n.yourdomain.com/mcp/marketing/sse) or create an API Key.",
      },
      {
        title: "Save Base URL / API Key or Connect MCP Server",
        description:
          "Enter your n8n credentials or link your n8n MCP Server URL directly.",
      },
    ],
    requiredScopes: ["workflows:read", "executions:trigger", "mcp:sse"],
    envFields: [
      {
        key: "N8N_BASE_URL",
        label: "n8n Base URL (N8N_BASE_URL)",
        placeholder: "https://n8n.example.com",
        secret: false,
        helpText: "Base URL of your n8n Cloud or self-hosted instance.",
      },
      {
        key: "N8N_API_KEY",
        label: "n8n API Key (N8N_API_KEY)",
        placeholder: "n8n_api_...",
        secret: true,
        helpText: "Used server-side to authenticate webhook and workflow triggers.",
      },
    ],
    directConnect: null,
    mcp: {
      serverName: "n8n Native MCP Server Trigger & n8n-mcp",
      packageName: "n8n-mcp",
      npxCommand: "npx -y n8n-mcp",
      defaultEndpointPlaceholder: "https://n8n.yourdomain.com/mcp/tangent-workflows/sse",
      documentationUrl: "https://docs.n8n.io/advanced-ai/examples/using-n8n-mcp-server/",
      availableTools: [
        "n8n_list_workflows",
        "n8n_execute_approved_workflow",
        "n8n_mcp_custom_webhook_tool",
        "n8n_get_execution_status",
      ],
      steps: [
        {
          title: "Add an 'MCP Server Trigger' Node in n8n",
          description:
            "n8n natively exposes workflows as an MCP Server! Drop the 'MCP Server Trigger' node onto your n8n canvas and attach any tools (CRM, WhatsApp, Slack, Sheets).",
        },
        {
          title: "Paste n8n MCP SSE URL in Step 2",
          description:
            "Paste the n8n Production SSE URL (or use npx -y n8n-mcp) and optional header auth token to link n8n to Tangent.",
        },
      ],
    },
  },

  razorpay: {
    id: "razorpay",
    developerPortalName: "Razorpay Dashboard — API Keys & Official MCP",
    developerPortalUrl: "https://dashboard.razorpay.com/app/keys",
    estimatedMinutes: "3 min",
    summary:
      "Configure Razorpay API keys or the Official Razorpay MCP Server (@razorpay/mcp-server) for subscription billing and payment links (INR).",
    steps: [
      {
        title: "Generate API Keys in Razorpay Dashboard",
        description:
          "Go to dashboard.razorpay.com → Account & Settings → API Keys and generate a Key ID and Key Secret.",
      },
      {
        title: "Configure Webhook Secret or Razorpay Official MCP",
        description:
          "Under Account & Settings → Webhooks, add a webhook secret, OR run Razorpay's official MCP server (@razorpay/mcp-server).",
      },
      {
        title: "Save Razorpay Credentials or Link MCP Server",
        description:
          "Enter your Key ID, Key Secret, and Webhook Secret or connect via Razorpay MCP.",
      },
    ],
    requiredScopes: ["subscription.activated", "subscription.charged", "subscription.cancelled"],
    envFields: [
      {
        key: "RAZORPAY_KEY_ID",
        label: "Razorpay Key ID (RAZORPAY_KEY_ID)",
        placeholder: "rzp_test_... or rzp_live_...",
        secret: false,
        helpText: "Your Razorpay merchant key ID.",
      },
      {
        key: "RAZORPAY_KEY_SECRET",
        label: "Razorpay Key Secret (RAZORPAY_KEY_SECRET)",
        placeholder: "Razorpay key secret",
        secret: true,
        helpText: "Stored server-side only.",
      },
      {
        key: "RAZORPAY_WEBHOOK_SECRET",
        label: "Razorpay Webhook Secret (RAZORPAY_WEBHOOK_SECRET)",
        placeholder: "Webhook signing secret",
        secret: true,
        helpText: "Used to verify X-Razorpay-Signature on incoming billing webhooks.",
      },
    ],
    directConnect: null,
    mcp: {
      serverName: "Razorpay Official MCP Server",
      packageName: "@razorpay/mcp-server",
      npxCommand: "npx -y @razorpay/mcp-server",
      defaultEndpointPlaceholder: "https://mcp.razorpay.com/sse",
      documentationUrl: "https://razorpay.com/docs/mcp-server/",
      availableTools: [
        "razorpay_fetch_subscriptions",
        "razorpay_fetch_invoices",
        "razorpay_fetch_payments",
        "razorpay_create_payment_link",
      ],
      steps: [
        {
          title: "Official Razorpay MCP Server (@razorpay/mcp-server)",
          description:
            "Razorpay provides an official MCP server that lets AI agents inspect subscription status, invoices, and payment links in INR.",
        },
        {
          title: "Connect Razorpay MCP in Step 2",
          description:
            "Select Stdio (`npx -y @razorpay/mcp-server`) or Remote SSE endpoint and attach your Razorpay credentials.",
        },
      ],
    },
  },
}

