# Security Policy

This is a local-network prototype designed for a Raspberry Pi or similar small local server. It is not intended to store sensitive personal information.

## Privacy Boundary

The app should only store:

- First name
- Last name
- Selected activities
- Check-in time
- Scheduled activity times
- Activity status

Do not add fields for birthdates, government IDs, addresses, phone numbers, medical details, immigration details, or personal notes without a full privacy review.

## Admin Access

Admin access is protected by a local PIN. This is enough for the prototype, but it is not a replacement for full web security if the system is later hosted publicly.

If the app is ever exposed outside the local building network, add:

- HTTPS
- Strong authentication
- Session expiration
- Backup and restore planning
- Network firewall rules
- A privacy and data retention review

## Reporting A Security Issue

If this project is placed on GitHub, use a private security advisory or contact the project maintainer directly. Do not post sensitive security details in a public issue.
