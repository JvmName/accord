# Accord - an Rdojo Kombat app

A KMP (Android/JVM/Web) client + Node.js backend that tracks controlled grappling time in the Rdojo Kombat sport. See [rdojo.com/kombat](https://www.rdojo.com/kombat) for more information.

This app enables multiple judges to vote in real time on which competitor has control during a match. "Control time" only accumulates when enough judges agree — a single biased judge can't skew the result.


## Setup

### Prerequisites

- Node.js (v22+)
- JDK 21+
- Android SDK (for Android builds)

### Server

```bash
cd server
npm install
npm run db:migrate
npm start
```

`npm start` launches both the API server and the background worker process. The workers  handle round timers, break transitions, and tech fall detection. 

**Environment variables:**

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Port the server listens on |
| `WEB_ORIGIN` | — | Allowed CORS origin for the web client (e.g. `https://yourapp.com`) |

### Client

The client supports Android, JVM desktop, and browser (Kotlin/Wasm).

```bash
cd app
./gradlew :androidApp:installDebug  # Android
./gradlew :shared:run               # JVM desktop
./gradlew :shared:wasmJsBrowserDevelopmentRun  # Browser (dev)
```
