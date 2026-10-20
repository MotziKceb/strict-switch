// Plain-language explanations of tracker categories: a one-line note on what
// allowing one means, and a longer one for those who click "More about".
// Worded as what a company *can* do, not what it does: facts, not verdicts.

export const ALLOW_MEANS = {
  content: (c) => `${c} supplies something the page shows, like a video, map or font. Allowing it lets ${c} see that you visited this page.`,
  social: (c) => `Allowing it lets ${c} see that you visited this site, and link the visit to your ${c} account if you're logged in.`,
  advertising: (c) => `${c} uses this to show and measure ads. Allowing it lets ${c} add this visit to what it knows about your interests.`,
  analytics: (c) => `${c} uses this to record how people use the site. Allowing it lets ${c} see your visit, and it may combine that with other sites it measures.`,
  fingerprinting: (c) => `${c} uses this to recognise your browser without cookies. Pages rarely need it to work.`,
  cryptomining: (c) => `${c} uses this to mine cryptocurrency with your computer's power. Pages never need it to work.`,
};

export const CATEGORY_DETAILS = {
  content: 'Tracking content is real content from a company that also tracks: embedded videos, maps, fonts, images and code libraries. The page often needs it, which is why it\'s off by default. Every time your browser loads it, the company learns which page you were on, and it can recognise you across the sites that use it.',
  social: 'Social trackers come from social networks: like and share buttons, embedded posts, comments and "Log in with" buttons. They tell the network which pages you visit, even if you never click them. If you\'re logged in, the visit can be tied to your account.',
  advertising: 'Advertising trackers come from ad networks. They show ads, count views and clicks, and build a profile of your interests from the sites you visit, so ads can follow you around the web. Pages almost never need them to work.',
  analytics: 'Analytics trackers count visitors and record what they do on a site: pages viewed, clicks, time spent. Some only work for that site; the big ones see a large part of the web and can combine what they see.',
  fingerprinting: 'Fingerprinting scripts read details about your browser and device (screen size, fonts, settings) to build an ID that stays the same even after you clear cookies. Some sites use it against fraud, but it\'s also used to follow people across sites.',
  cryptomining: 'Cryptomining scripts use your computer\'s processor to earn cryptocurrency for someone else. They slow your computer down and drain batteries, and no page needs them.',
};
