# BossBoard Mobile App

Mobile-first compliance & cashflow platform for NZ tradies, built with React Native (Expo).

For development setup, build, and deployment instructions see [SETUP.md](./SETUP.md).

## End-to-end testing with Maestro

The mobile app uses [Maestro](https://maestro.mobile.dev/) for headed end-to-end testing. Flows are YAML files in `.maestro/`; Maestro drives a running simulator or emulator, no native build required.

### One-time setup

Install the Maestro CLI at the user level (not as an npm dependency — it ships its own JVM-based runtime):

```bash
npm run e2e:install-maestro
export PATH="$PATH:$HOME/.maestro/bin"
maestro --version
```

Maestro 2.x requires Java 17 or higher on the host. Verify with `java -version` before running flows.

### Running flows

A device or simulator must be booted before invoking Maestro:

- iOS: `xcrun simctl boot "iPhone 15"`
- Android: open Android Studio -> AVD Manager -> Play

Then:

```bash
# Run every flow in .maestro/
npm run e2e:mobile

# Run a single flow
npm run e2e:mobile:single .maestro/00-smoke-app-launches.yaml
```

Screenshots land in `.maestro/screenshots/`. Flows are version-controlled (not gitignored) so the demo set travels with the repo.

### Authoring flows

Each flow is a YAML file describing user actions and assertions against the Expo RN app (`appId: com.instilligent.bossboard`). The numeric `NN-` prefix in the filename controls demo ordering — `00-` is the smoke flow, feature-specific flows start at `01-`.

See `00-smoke-app-launches.yaml` for the minimal pattern (launch app, assert brand text visible, screenshot).
