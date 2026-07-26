import asyncio, edge_tts, json, subprocess, os

VOICE = "en-US-AriaNeural"
RATE = "-4%"  # a touch slower for a measured, professional narration

# (scene id, kind, narration). kind: deck1/deck2/scorecard/zk/tamper/refusal/staking/agent/compliance/govern/close
SCENES = [
    ("s01", "Amanah — an autonomous, compliant real-world-asset treasury agent on Casper. The idea is simple: proof, not a diary."),
    ("s02", "Most A.I. money agents ask you to trust a log file. No proof they followed their mandate. No proof they're solvent. No independent check before they move your funds."),
    ("s03", "Amanah makes trust structural. This is the entire system, checked live against the Casper chain right now — ten headline claims, all ten green."),
    ("s04", "Here's a zero-knowledge proof that the treasury is solvent — its reserves cover what it owes — without revealing a single amount. And your browser just re-ran it."),
    ("s05", "Watch me claim we hold more than we actually do. The proof fails, instantly. You don't have to trust the math — you can break it yourself."),
    ("s06", "Every move needs an independent auditor quorum to approve it, on-chain. This decision wasn't approved — so the contract refused it. A refusal is the control working."),
    ("s07", "And this isn't paper. The treasury's Casper reserve is delegated to a validator, earning real native staking rewards right now — decided autonomously by the agent."),
    ("s08", "Every decision is made by a consensus of three different model families, signed, attested on-chain, and graded by an independent auditor, before a single token moves."),
    ("s09", "For a regulator, Amanah generates the exception report and operating-effectiveness evidence they actually ask for — all of it, straight from the chain."),
    ("s10", "And a human stays in the loop. Connect a real wallet, and approve a decision yourself, as an on-chain vote."),
    ("s11", "Every other agent in this field does one of these. Amanah is the whole trust stack — and every claim is a public transaction you can check yourself. Don't trust us. Verify us."),
]

async def main():
    os.makedirs("narration", exist_ok=True)
    durs = {}
    for sid, text in SCENES:
        out = f"narration/{sid}.mp3"
        await edge_tts.Communicate(text, VOICE, rate=RATE).save(out)
        d = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", out], capture_output=True, text=True).stdout.strip()
        durs[sid] = round(float(d), 3)
        print(f"{sid}: {durs[sid]}s")
    json.dump({"order": [s[0] for s in SCENES], "durations": durs, "total": round(sum(durs.values()), 2)}, open("narration/durations.json", "w"))
    print("TOTAL:", round(sum(durs.values()), 1), "s")

asyncio.run(main())
