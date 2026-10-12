# Fudget

A mobile-friendly household budget, rebuilt from a spreadsheet. Each person's salary package flows through super, tax and HECS into take-home pay, then through shared and personal costs, monthly allocations, savings projections, a first-home purchase and mortgage payoff options.

- Your numbers are saved only in your browser. Use **Backup** to export or import a file.
- **Backup → Download spreadsheet** writes your numbers into the original workbook (`budget-template.xlsx`, all nine tabs and formulas), ready for Excel or Google Sheets.
- Tabs: Income, Budget (with Variations to compare), Savings, House, Goals.
- Tax years: 2026-27 (current) and 2024-25 (matches the original spreadsheet).
- No build step: static files served by GitHub Pages. Locally, run `python3 -m http.server` and open http://localhost:8000.
- Tests: `node --test`

Terms used in the code and UI are defined in `CONTEXT.md`.
