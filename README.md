# Campaign Pilot

A browser-based WhatsApp outreach workspace for importing contacts, opening prepared WhatsApp messages, and tracking sent/failed status.

## Features

- Import contacts from CSV, TXT, or VCF files
- Add contacts manually
- Skip duplicate numbers and show duplicate count
- Customize message template with `{{name}}`, `{{business}}`, and `{{offer}}`
- Open the next WhatsApp message manually
- Start a timer to open the next pending message after a set number of seconds
- Mark contacts as sent, failed, skipped, or deleted
- Export campaign logs as CSV

## CSV Format

```csv
Name,Country Code,Phone Number
Ali Khan,92,3001234567
Sara Ahmed,971,501234567
```

## GitHub Pages Setup

1. Open repository Settings.
2. Go to Pages.
3. Under Build and deployment, choose Deploy from a branch.
4. Select branch `main` and folder `/root`.
5. Save.

Live URL format:

```text
https://mrarshadliaquat.github.io/GCM-Marketing/
```

## Important

This app opens WhatsApp with a prepared message. The final green Send button is inside WhatsApp Web or WhatsApp Desktop.

Use this only for contacts who gave permission to receive WhatsApp messages.
