// Where the project lives. Links only: the extension opens these pages for
// the user and never sends anything itself.
export const REPO_URL = 'https://github.com/MotziKceb/Strict-Switch';
export const ISSUES_URL = `${REPO_URL}/issues/new/choose`;
export const PRIVACY_URL = `${REPO_URL}/blob/main/PRIVACY.md`;
export const brokenSiteIssueUrl = (site) =>
  `${REPO_URL}/issues/new?template=site-broken.yml&title=${encodeURIComponent(`Broken site: ${site ?? ''}`)}`
  + (site ? `&site=${encodeURIComponent(site)}` : '');
