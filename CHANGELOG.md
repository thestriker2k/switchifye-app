# Changelog

All notable changes to the Switchifye iOS app will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.3] — 2026-04-16

### Added
- Terms of Service and Privacy Policy links on paywall (required by Apple review guidelines)

### Changed
- Redesigned login screen with light theme matching the web login — polished Apple logo for better optical balance with the Google mark, email hidden behind a "Continue with Email" button, secondary text-link treatment for "Continue as Guest"

### Fixed
- Auto-restore on duplicate purchase attempt — subscription is now restored automatically when tapping Subscribe Now while already subscribed, instead of showing a raw error
- Suppressed E_ALREADY_OWNED error flash during auto-restore
- Stale session token on receipt validation — expired auth tokens now refresh automatically and retry on 401 responses, preventing "Invalid token" errors after extended periods with the app open
- Review bypass authentication — resolved environment variable parsing issue preventing the App Store review account from signing in; variable is now correctly injected into EAS production and preview builds

## [1.0.2]
- Previous release (add earlier entries retroactively if desired, or leave blank)
