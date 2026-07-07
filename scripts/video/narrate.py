"""Generate a natural neural voiceover (Microsoft Edge TTS, free, no key) + SRT subtitles
for the Amanah demo. Writes per-segment mp3s, a concatenated narration.mp3, timing.json
(consumed by record.mjs to pace the screen capture), and subs.srt.
Usage: python narrate.py <out_dir>"""
import asyncio, edge_tts, json, subprocess, sys, os

VOICE = "en-US-AriaNeural"   # natural, warm; -8% rate reads a touch slower for clarity
RATE = "-8%"

# Each segment: the narration for one scene. record.mjs holds that scene for the clip's
# measured duration, so audio and video stay in sync.
SEGMENTS = [
    "Most AI agents that manage money ask you to trust a log file. Amanah proves every decision on-chain — and independent agents must approve it before a single token moves. It's live on Casper testnet.",
    "Let's open the live dashboard. This is a real tokenized treasury: one million dollars, with eight hundred thousand locked as principal by a vault invariant. The agent can only ever move the yield.",
    "The holdings — gold, US treasuries, oil, and Casper — are read live from the vault contract, with real twenty-four-hour price changes from the market.",
    "The first safeguard is an on-chain circuit breaker. If the agent's reputation drops below a floor, the vault refuses to trade — and a dead-man's switch lets anyone freeze it if the agent goes silent.",
    "Solvency is proven in zero knowledge. A Pedersen and Schnorr proof shows the reserves cover the principal, while hiding the exact per-asset split from front-runners.",
    "K-Y-C is zero-knowledge too. The agent proves it holds a valid credential with a Schnorr proof verified inside the contract — the secret is never sent.",
    "And approval isn't one agent's call. A two-of-three quorum of independent auditors must each sign off on-chain before a move can execute.",
    "Spending passes a custodian-owned gate held by a separate key. The agent can't raise its own limits, clear its own K-Y-C, or ever touch the principal.",
    "Every decision is a public transaction. This audit trail links straight to cspr dot live — including the agent paying for market data over x402, and even earning x402 payments for its verified reasoning.",
    "Here's the very same vault on the Casper block explorer. Real contract, real state, independently verifiable by anyone.",
    "Each cycle, the agent enriches its view through two official Casper M-C-P servers — CSPR dot cloud and the CSPR dot trade DEX — then reasons over the live data.",
    "The agent console shows that reasoning — signed, hashed, and verified by the contract itself before it is recorded. Proof, not a diary.",
    "You can connect a Casper wallet directly: Casper Wallet, Ledger, or social login, through the official hosted SDK.",
    "Amanah — the on-chain fiduciary layer for autonomous real-world-asset treasuries. Ten smart contracts live, every claim provable. Find us on X, Discord, and Telegram. Thanks for watching.",
]


def probe(path):
    out = subprocess.check_output(
        ["ffprobe", "-v", "quiet", "-show_entries", "format=duration", "-of", "csv=p=0", path])
    return float(out.decode().strip())


def ts(s):
    h = int(s // 3600); m = int((s % 3600) // 60); sec = s % 60
    return f"{h:02d}:{m:02d}:{sec:06.3f}".replace(".", ",")


async def main(out):
    os.makedirs(out, exist_ok=True)
    durs = []
    for i, text in enumerate(SEGMENTS):
        raw = os.path.join(out, f"seg{i}.raw.mp3")
        mp3 = os.path.join(out, f"seg{i}.mp3")
        await edge_tts.Communicate(text, VOICE, rate=RATE).save(raw)
        # Pad each clip with 0.5s trailing silence so the SAME timeline drives audio,
        # video pacing, and subtitles (no drift between voice and on-screen scene).
        subprocess.run(["ffmpeg", "-y", "-i", raw, "-af", "apad=pad_dur=0.5",
                        "-c:a", "libmp3lame", mp3], check=True,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        durs.append(probe(mp3))
        print(f"  seg{i}: {durs[-1]:.1f}s")

    # concat the padded clips back-to-back — the timeline already has the gaps.
    concat = os.path.join(out, "concat.txt")
    with open(concat, "w") as f:
        for i in range(len(SEGMENTS)):
            f.write(f"file 'seg{i}.mp3'\n")
    subprocess.run(["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", concat,
                    "-c:a", "libmp3lame", os.path.join(out, "narration.mp3")], check=True,
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    # timing.json for the recorder
    json.dump({"segments": [{"text": t, "dur": d} for t, d in zip(SEGMENTS, durs)]},
              open(os.path.join(out, "timing.json"), "w"), indent=2)

    # SRT subtitles
    t = 0.0; lines = []
    for i, (text, d) in enumerate(zip(SEGMENTS, durs)):
        lines.append(f"{i+1}\n{ts(t)} --> {ts(t + d)}\n{text}\n")
        t += d
    open(os.path.join(out, "subs.srt"), "w", encoding="utf-8").write("\n".join(lines))
    print(f"total narration ~{t:.0f}s")


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1] if len(sys.argv) > 1 else "out"))
