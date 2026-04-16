# Releasing a new version

## When shipping a new user-facing version

1. Move all [Unreleased] entries in CHANGELOG.md into a new versioned section with today's date.
2. Bump the `version` field in `app.json` (e.g., 1.0.3 → 1.0.4). Use semantic versioning — patch for fixes, minor for features, major for breaking changes.
3. Commit: `git add . && git commit -m "Release vX.Y.Z"`
4. Tag the release: `git tag vX.Y.Z && git push --tags`
5. Push: `git push`
6. Build: `eas build --platform ios --profile production`
7. Wait for build to complete (EAS will email). The `buildNumber` auto-increments because `autoIncrement: true` is set in eas.json — no manual bump needed.
8. Commit the updated buildNumber in app.json that EAS generated: `git add app.json && git commit -m "Bump iOS buildNumber after EAS build" && git push`
9. Submit to App Store Connect: `eas submit --platform ios --profile production`
10. In App Store Connect, fill out the public "What's New" changelog (copy the user-facing entries from CHANGELOG.md — paraphrase for non-technical users) and the "What to Test" notes for Apple reviewers (specific instructions, e.g., "log in with review@switchifye.com to verify bypass works").
11. Submit for review.

## Important environment notes

- `EXPO_PUBLIC_REVIEW_PASSWORD` is set in both the `.env` file (for local dev) and the eas.json `env` block (for EAS production and preview builds). All three must match the password stored for review@switchifye.com in Supabase.
- If the review password ever stops working, check dotenv parsing — values containing `#` characters must be single-quoted in .env, otherwise dotenv strips them as comments.

## Post-approval checklist

- Verify the build rolled out to App Store successfully
- Test download from the App Store on a personal device
- If the release involved auth/payment changes, verify end-to-end with a real account
- (Optional) Rotate the review bypass password in Supabase + .env + eas.json if any security concerns
