<div align="center">

# Urizen

### The AI-native, on-chain trading desk — native for macOS.

![Urizen — the on-chain trading desk for macOS](media/uri-os.gif)

<br/>

[**⤓ Download for macOS**](https://github.com/0xredwald/urizen-os/releases/latest) &nbsp;·&nbsp; [urizenfund.com](https://urizenfund.com)

</div>

---

Urizen is a native macOS desk for trading tokenized equities and perps on Robinhood Chain, wrapped around an agent that reads the tape with you. It runs a distinct native shell — a left rail, a home chat, a research desk, and a connectors panel — over the live desk at [urizenfund.com](https://urizenfund.com).

## Features

- **Talk to the desk** — a home chat grounded in live market data, with a `/` command palette for skills and actions.
- **Speak your trades** — hold the mic and ask out loud. Speech is transcribed by a **local Whisper model on your Mac** — audio never leaves the device.
- **Research desk** — spin up a multi-desk research run on any ticker and get a synthesized memo.
- **Connectors** — toggle the built-in market, fundamentals, ratings, news and on-chain feeds the agent grounds in, or wire your own **MCP servers**.
- **Self-custodial trading** — spot and perps open in your browser so your wallet stays yours; the agent proposes, you sign.
- **Native touches** — a live price ticker in the menu bar, a global summon hotkey (`⌘⌥U`), and system notifications on big moves.

## Download

Grab the latest `.dmg` from the [**releases page**](https://github.com/0xredwald/urizen-os/releases/latest), open it, and drag Urizen to Applications.

> The build is not yet notarized by Apple. On first launch, right-click the app → **Open** (or allow it under **System Settings → Privacy & Security**). This is a one-time step.

## Build from source

```bash
npm install
npm start          # run in dev
npm run dist       # build a signed-less .dmg into dist/
```

Requires Node 18+ and macOS (Apple Silicon).

## How it works

A thin [Electron](https://www.electronjs.org/) shell hosts a native left rail and window chrome, and renders the desk in a `<webview>`. Wallet pop-ups stay in-app on a shared session so WalletConnect keeps working; everything else opens in the system browser. The home chat, voice transcription, and connectors run locally in the shell.

## License

[MIT](LICENSE)
