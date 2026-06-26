# Open Source Readiness

This project is structured so it can be published on GitHub as an open-source shelter kiosk,
dashboard, and scheduling prototype.

## Recommended Before Publishing

1. Create or connect a GitHub account.
2. Create a new public repository, for example `Homeless-Shelter-Website-Design`.
3. Review the license with the project owner or organization.
4. Confirm no private `.env` files, SQLite databases, logs, APK signing keys, or personal files are included.
5. Run:

```bash
npm run format:check
npm test
npm run build
```

## Files That Should Not Be Published

The `.gitignore` file excludes local-only files such as:

- `node_modules/`
- `dist/`
- `data/*.sqlite`
- `.env`
- log files
- temporary QA screenshots

Before publishing, also avoid committing generated Android build folders, private app-store signing
material, real staff PINs, or live shelter database files.

## Code Organization Standard

Use this rough order inside source files:

1. Imports
2. Constants and configuration
3. Small helper functions
4. Main exported function or component
5. Supporting components or specialized helpers

This keeps the code easier for volunteers, shelter staff, and outside developers to read.

## License Note

A permissive MIT license is included so the project can be shared and adapted. Before publishing
under an organization name, confirm the license choice with the owner of the project.
