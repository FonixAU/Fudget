# Fudget
Budgeting web version of my spreadsheet: a mobile-friendly view of the Google Sheet, with search and live totals.

- No build step. Open `index.html` via any static host (GitHub Pages, Vercel), or run `python3 -m http.server` locally.
- The sheet must be shared "Anyone with the link can view". Data loads in the browser straight from Google.
- Add tab names to `TABS` in `index.html` to get one button per tab.
- Tests: `node --test`
