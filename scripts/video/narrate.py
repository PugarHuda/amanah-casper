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
    "Most AI agents that manage money ask you to trust a log file. Amanah does the opposite: the vault itself refuses to move a single token unless independent auditors have approved that exact decision on-chain. It is live on Casper testnet.",
    "Here is the treasury. One million dollars of tokenized real-world assets, with eight hundred thousand locked as principal by a vault invariant. The agent can only ever move the yield.",
    "The holdings — gold, US treasuries, oil, and Casper — are read live from the vault contract, with real twenty-four-hour price moves from the market.",
    "Now the part that matters. This counter is not decoration: eight vault transactions in the last thirty days, six executed and two REFUSED by a guard rail. The refusals are the controls doing their job.",
    "Here is one of them. A decision the auditors never approved was refused by the contract — even though it was signed with the agent's own key and its reputation was passing. So a fully compromised agent key still cannot move funds.",
    "The same vault also refuses to create value. We found the bug ourselves through edge-case testing: reallocating an asset to itself used to mint tokens from nothing. It is now rejected on-chain.",
    "And if the agent goes silent, anyone can freeze the vault. An unrelated third-party key did exactly that, was then denied when it tried to lift the freeze, and only the custodian could release it.",
    "Solvency is proven in zero knowledge, every cycle — not once. No individual allocation appears in the proof, and the contract checks both that the commitments sum to the claimed total and that the total matches the vault's real balances.",
    "The strongest criticism of zero-knowledge proofs of reserves is that only specialists can check them. So we built this. The proof re-runs in YOUR browser, against the exact bytes the contract accepted.",
    "And you can break it. Claim a thousand dollars more than we hold, and the proof is rejected instantly. Change a single digit in a decision, and its hash no longer matches what was attested. You do not need to trust us.",
    "For the people who have to answer to a regulator, this is the artifact they actually ask for: an exception report naming every transaction a control refused, generated from the chain, exportable, with the scope limits stated plainly.",
    "Each cycle the agent reads live prices, buys a multi-asset signal over x402, reasons with an L-L-M through two official Casper M-C-P servers, then signs its reasoning — and the contract verifies that signature before recording it.",
    "Ten smart contracts on Casper, a hundred and eleven automated tests, and every claim on this page is a public transaction you can open yourself.",
    "Amanah — the on-chain fiduciary layer for autonomous real-world-asset treasuries. Don't trust us. Verify. Thanks for watching.",
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
