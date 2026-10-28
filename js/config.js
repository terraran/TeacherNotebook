// sheetsUrl: the Apps Script Web app URL (Deploy → Web app → URL ending in /exec).
// While sheetsUrl is empty the app runs in local mode (data stays in this browser only).
// googleClientId: OAuth client ID (Web) whose Authorized JavaScript origins include
// https://terraran.github.io and http://localhost:5173. Must match GOOGLE_CLIENT_ID in Code.gs.
export const config = {
  googleClientId: '501163435800-agtmqo92jg3b61tj6dafk0u73qergc0h.apps.googleusercontent.com',
  sheetsUrl: '',
};
