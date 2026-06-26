# Contributing

Thank you for helping improve this local shelter check-in system. This project is meant to stay lightweight, privacy-conscious, and practical for shelters or community sites running on low-cost hardware.

## Project Values

- Keep guest privacy first. The current system stores first and last name only. Do not add birthdates, addresses, IDs, medical details, immigration details, or sensitive notes.
- Keep the Raspberry Pi target in mind. Avoid heavy libraries, local AI models, complex databases, or unnecessary background services.
- Keep the language warm and clear for guests and staff.
- Keep changes understandable for a small nonprofit team.

## Code Style

This project uses Prettier for formatting.

- Use 2 spaces for indentation.
- Use double quotes in JavaScript and JSX.
- Keep imports at the top of the file.
- Put constants and helper functions near the top when they support the main component or module.
- Keep comments short and useful. Add comments for scheduling rules, privacy rules, kiosk behavior, or code that is not obvious at a glance.
- Prefer small, named functions over long blocks of repeated logic.

Run formatting before sharing changes:

```bash
npm run format
```

Check formatting without changing files:

```bash
npm run format:check
```

Run tests:

```bash
npm test
```

Build the app:

```bash
npm run build
```

## Pull Request Checklist

Before opening a pull request:

- The app still starts locally.
- `npm test` passes.
- `npm run build` passes.
- `npm run format:check` passes.
- Kiosk text still matches the current name-based sign-in flow.
- No sensitive guest information is collected.
- README or deployment docs are updated if setup changes.
