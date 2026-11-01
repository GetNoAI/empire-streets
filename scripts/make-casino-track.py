#!/usr/bin/env python3
"""
"High Roller Lounge": the Empire Royale casino's backing track, synthesised from scratch (numpy).

A swinging lounge-jazz loop in F at 116 bpm: walking upright bass, brushes and a ride cymbal,
an FM electric piano comping on the off-beats, vibraphone on the tune, a muted-trumpet answer
in the middle chorus, and a sprinkle of slot-machine bells on the turnarounds. Three choruses of
a 16-bar form (about 1:40), rendered as a seamless loop: the tails of the last bar are folded back
onto the start so the music never hiccups when the game loops it.

  python3 scripts/make-casino-track.py            -> public/music/high-roller-lounge.mp3
"""
import math
import os
import subprocess
import sys
import wave

import numpy as np
from scipy.signal import butter, sosfilt

SR = 44100
BPM = 116
BEAT = 60 / BPM
BAR = BEAT * 4
SWING = 0.64  # share of the beat the first swung eighth takes
rng = np.random.default_rng(1977)

NOTE = {'C': 0, 'Db': 1, 'D': 2, 'Eb': 3, 'E': 4, 'F': 5, 'Gb': 6, 'G': 7, 'Ab': 8, 'A': 9, 'Bb': 10, 'B': 11}


def hz(midi):
    return 440.0 * 2 ** ((midi - 69) / 12)


# Chords: root (pitch class), quality. Two chords in a bar where listed as a pair.
FORM = [
    [('F', 'maj7')], [('D', '7')], [('G', 'm7')], [('C', '7')],
    [('A', 'm7')], [('D', '7')], [('G', 'm7'), ('C', '7')], [('F', 'maj7')],
    [('Bb', 'maj7')], [('Bb', 'm6')], [('A', 'm7')], [('D', '7')],
    [('G', 'm7')], [('C', '7')], [('F', 'maj7'), ('D', '7')], [('G', 'm7'), ('C', '7')],
]
QUAL = {'maj7': [0, 4, 7, 11], '7': [0, 4, 7, 10], 'm7': [0, 3, 7, 10], 'm6': [0, 3, 7, 9]}
CHORUSES = 3
BARS = len(FORM) * CHORUSES
LENGTH = BARS * BAR
TAIL = 3.0
N = int((LENGTH + TAIL) * SR)
mix = {k: np.zeros(N) for k in ['bass', 'drums', 'keys', 'vibes', 'horn', 'bells']}


def add(track, t0, sig):
    i = int(t0 * SR)
    if i >= N:
        return
    j = min(N, i + len(sig))
    mix[track][i:j] += sig[: j - i]


def env(n, a, d, s_level, r_from=None):
    """Attack (s), exponential decay towards a sustain level."""
    t = np.arange(n) / SR
    e = np.where(t < a, t / max(a, 1e-4), s_level + (1 - s_level) * np.exp(-(t - a) / max(d, 1e-4)))
    if r_from is not None:
        rr = int(r_from * SR)
        if rr < n:
            e[rr:] *= np.exp(-np.arange(n - rr) / SR / 0.05)
    return e


def chord_at(bar, beat):
    ch = FORM[bar % len(FORM)]
    return ch[0] if len(ch) == 1 or beat < 2 else ch[1]


def chord_tones(ch, base):
    r = NOTE[ch[0]]
    return [base + ((r + iv) % 12) for iv in QUAL[ch[1]]]


def swung(beat_index, half):
    """Time offset within the bar of an eighth: half 0 = on the beat, 1 = the swung off-beat."""
    return beat_index * BEAT + (SWING * BEAT if half else 0)


# ---------------------------------------------------------------- bass: walking quarter notes
def bass_note(f, dur):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # Plucked upright: a fundamental and a couple of harmonics, a thump on the attack.
    sig = np.sin(2 * np.pi * f * t) + 0.35 * np.sin(4 * np.pi * f * t) + 0.12 * np.sin(6 * np.pi * f * t)
    sig *= env(n, 0.006, 0.35, 0.25, dur * 0.92)
    thump = np.sin(2 * np.pi * 55 * t) * np.exp(-t / 0.03) * 0.3
    return (sig + thump) * 0.32


prev = 41  # F2
for bar in range(BARS):
    for beat in range(4):
        ch = chord_at(bar, beat)
        tones = chord_tones(ch, 36)  # around C2..B2
        root = 36 + NOTE[ch[0]]
        if root < 38:
            root += 12
        if beat == 0 or (len(FORM[bar % len(FORM)]) == 2 and beat == 2):
            target = root
        elif beat == 3:
            # Approach the next chord's root from a semitone away.
            nxt = chord_at(bar + 1, 0)
            nr = 36 + NOTE[nxt[0]]
            if nr < 38:
                nr += 12
            target = nr + (1 if rng.random() < 0.5 else -1)
        else:
            cands = [m for m in tones + [x + 12 for x in tones] if 36 <= m <= 55]
            target = min(cands, key=lambda m: abs(m - prev) + rng.random() * 3)
        prev = target
        add('bass', bar * BAR + beat * BEAT, bass_note(hz(target), BEAT * 0.98))


# ---------------------------------------------------------------- drums: ride, brushes, feathered kick, hats on 2 and 4
def noise(n):
    return rng.standard_normal(n)


def hp(sig, a=0.92):
    out = np.empty_like(sig)
    y = 0.0
    x0 = 0.0
    for i, x in enumerate(sig):
        y = a * (y + x - x0)
        x0 = x
        out[i] = y
    return out


ride_base = hp(noise(int(0.9 * SR)), 0.97)
t_r = np.arange(len(ride_base)) / SR
ride_ping = sum(np.sin(2 * np.pi * f * t_r) for f in [3150, 4720, 5980, 7310]) * 0.05
RIDE = (ride_base * 0.07 + ride_ping) * np.exp(-t_r / 0.38)
hat_base = hp(noise(int(0.12 * SR)), 0.985)
HAT = hat_base * np.exp(-np.arange(len(hat_base)) / SR / 0.025) * 0.25
brush_base = noise(int(0.35 * SR))
BRUSH = brush_base * np.exp(-np.arange(len(brush_base)) / SR / 0.11) * 0.05
tk = np.arange(int(0.3 * SR)) / SR
KICK = np.sin(2 * np.pi * (48 + 60 * np.exp(-tk / 0.03)) * tk) * np.exp(-tk / 0.12) * 0.55

for bar in range(BARS):
    t0 = bar * BAR
    for beat in range(4):
        vel = 0.85 + 0.15 * rng.random()
        add('drums', t0 + beat * BEAT, RIDE * vel)
        add('drums', t0 + beat * BEAT, KICK * (0.5 if beat in (0, 2) else 0.25))
        if beat in (1, 3):
            add('drums', t0 + swung(beat, 1), RIDE * 0.7 * vel)  # the skip
            add('drums', t0 + beat * BEAT, HAT)
            add('drums', t0 + beat * BEAT, BRUSH * 1.4)
        # Brushes swirling under everything.
        add('drums', t0 + swung(beat, 1), BRUSH * 0.6)
    # A little fill into each chorus.
    if bar % 16 == 15:
        for k in range(3):
            add('drums', t0 + 3 * BEAT + k * BEAT / 3, BRUSH * 2.2)


# ---------------------------------------------------------------- keys: FM electric piano comping
def epiano(f, dur, vel=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    idx = 1.8 * np.exp(-t / 0.25) + 0.25
    mod = np.sin(2 * np.pi * f * t) * idx
    tine = np.sin(2 * np.pi * f * 14 * t) * np.exp(-t / 0.02) * 0.08
    sig = np.sin(2 * np.pi * f * t + mod) + tine
    # A touch of tremolo, like a Rhodes on a warm amp.
    sig *= 1 + 0.12 * np.sin(2 * np.pi * 4.6 * t)
    return sig * env(n, 0.004, 0.9, 0.18, dur * 0.95) * 0.15 * vel


def voicing(ch):
    r = NOTE[ch[0]]
    q = QUAL[ch[1]]
    # Rootless: 3rd, 7th (6th), 9th, 5th in the middle register.
    pcs = [(r + q[1]) % 12, (r + q[3]) % 12, (r + 2) % 12, (r + q[2]) % 12]
    out = []
    last = 52
    for pc in pcs:
        m = 52 + ((pc - 52) % 12)
        while m <= last - 1:
            m += 12
        if m > 72:
            m -= 12
        out.append(m)
        last = m
    return out


COMP = [(0, 1), (1, 1), (2, 0), (3, 1)]  # (beat, swung half) hits, varied per bar
for bar in range(BARS):
    pattern = [c for c in COMP if rng.random() < (0.85 if c[1] else 0.4)] or [(1, 1)]
    for beat, half in pattern:
        ch = chord_at(bar, beat)
        dur = BEAT * (0.55 if half else 0.9)
        for m in voicing(ch):
            add('keys', bar * BAR + swung(beat, half) + rng.random() * 0.008, epiano(hz(m), dur + 0.25, 0.8 + 0.3 * rng.random()))


# ---------------------------------------------------------------- vibes: the tune (chorus 1 and 3)
def vibe(f, dur):
    n = int(max(dur, 0.9) * SR)
    t = np.arange(n) / SR
    sig = np.sin(2 * np.pi * f * t) + 0.2 * np.sin(2 * np.pi * f * 4 * t) * np.exp(-t / 0.15)
    sig *= 1 + 0.35 * np.sin(2 * np.pi * 5.5 * t)  # motor tremolo
    return sig * env(n, 0.003, 1.1, 0.0) * 0.24


# A singable melody over the form: (bar, beat, half, midi, beats long)
MELODY = [
    (0, 0, 0, 72, 1.5), (0, 1, 1, 69, 0.5), (0, 2, 0, 76, 2),
    (1, 0, 1, 74, 1), (1, 2, 0, 72, 1), (1, 3, 0, 66, 1),
    (2, 0, 0, 70, 1.5), (2, 1, 1, 69, 0.5), (2, 2, 0, 67, 1), (2, 3, 1, 65, 0.5),
    (3, 0, 0, 64, 2), (3, 2, 1, 67, 0.5), (3, 3, 0, 70, 1),
    (4, 0, 0, 72, 1.5), (4, 1, 1, 71, 0.5), (4, 2, 0, 69, 2),
    (5, 0, 1, 66, 1), (5, 2, 0, 69, 1), (5, 3, 0, 72, 1),
    (6, 0, 0, 74, 1), (6, 1, 0, 72, 1), (6, 2, 0, 70, 1), (6, 3, 0, 67, 1),
    (7, 0, 0, 69, 3),
    (8, 0, 0, 74, 1.5), (8, 1, 1, 72, 0.5), (8, 2, 0, 69, 2),
    (9, 0, 0, 73, 1.5), (9, 1, 1, 70, 0.5), (9, 2, 0, 67, 2),
    (10, 0, 0, 72, 1), (10, 1, 0, 69, 1), (10, 2, 0, 67, 1), (10, 3, 1, 64, 0.5),
    (11, 0, 0, 66, 2), (11, 2, 0, 69, 1), (11, 3, 0, 72, 1),
    (12, 0, 0, 74, 1.5), (12, 1, 1, 70, 0.5), (12, 2, 0, 67, 2),
    (13, 0, 0, 76, 1), (13, 1, 0, 74, 1), (13, 2, 0, 72, 1), (13, 3, 0, 70, 1),
    (14, 0, 0, 69, 2), (14, 2, 0, 66, 2),
    (15, 0, 0, 67, 1), (15, 1, 1, 70, 0.5), (15, 2, 0, 72, 2),
]
for chorus in (0, 2):
    for bar, beat, half, m, beats in MELODY:
        add('vibes', (chorus * 16 + bar) * BAR + swung(beat, half), vibe(hz(m), beats * BEAT))


# ---------------------------------------------------------------- horn: a muted trumpet improvising in chorus 2
def horn(f, dur):
    n = int(dur * SR)
    t = np.arange(n) / SR
    vib = 1 + 0.006 * np.sin(2 * np.pi * 5.2 * t) * np.clip(t / 0.25, 0, 1)
    ph = 2 * np.pi * f * np.cumsum(vib) / SR
    # Harmon-mute colour: odd and even harmonics, the low ones thinned.
    sig = sum(a * np.sin(k * ph) for k, a in [(1, 0.35), (2, 0.5), (3, 0.6), (4, 0.45), (5, 0.3), (6, 0.18), (7, 0.1)])
    return sig * env(n, 0.03, 0.4, 0.55, dur * 0.85) * 0.07


SCALE = {'maj7': [0, 2, 4, 7, 9, 11], '7': [0, 2, 4, 7, 9, 10], 'm7': [0, 2, 3, 5, 7, 10], 'm6': [0, 2, 3, 5, 7, 9]}
cur = 69
for bar in range(16, 32):
    beat_pos = 0.0
    while beat_pos < 4:
        if rng.random() < 0.22:
            beat_pos += 0.5 if rng.random() < 0.6 else 1.0
            continue
        ch = chord_at(bar, int(beat_pos))
        r = NOTE[ch[0]]
        cands = [m for m in range(62, 82) if (m - r) % 12 in SCALE[ch[1]]]
        cur = min(cands, key=lambda m: abs(m - (cur + rng.integers(-4, 5))))
        length = 0.5 if rng.random() < 0.7 else (1.0 if rng.random() < 0.7 else 1.5)
        b = int(beat_pos)
        off = swung(b, 1) if beat_pos - b >= 0.5 else b * BEAT
        add('horn', bar * BAR + off, horn(hz(cur), length * BEAT * 0.95))
        beat_pos += length


# ---------------------------------------------------------------- bells: a jackpot sparkle on the turnarounds
def bell(f, dur=1.4):
    n = int(dur * SR)
    t = np.arange(n) / SR
    sig = sum(a * np.sin(2 * np.pi * f * k * t) * np.exp(-t / (0.5 / k)) for k, a in [(1, 1), (2.76, 0.5), (5.4, 0.25)])
    return sig * 0.05


for bar in range(7, BARS, 8):
    for k, m in enumerate([84, 88, 91, 96]):
        add('bells', bar * BAR + 3 * BEAT + k * 0.07, bell(hz(m)))


# ---------------------------------------------------------------- mix, a little room, fold the tail back for a seamless loop
def stereo(sig, pan):
    lg = math.cos((pan + 1) * math.pi / 4)
    rg = math.sin((pan + 1) * math.pi / 4)
    return np.stack([sig * lg, sig * rg], axis=1)


# Brushes and cymbals warm and soft: roll off their top end.
mix['drums'] = sosfilt(butter(2, 9000, 'low', fs=SR, output='sos'), mix['drums'])
out = stereo(mix['bass'], -0.05) * 1.0 + stereo(mix['drums'], 0.15) * 0.75 + stereo(mix['keys'], -0.35) + stereo(mix['vibes'], 0.35) + stereo(mix['horn'], 0.2) + stereo(mix['bells'], 0.5)
# A simple room: a few early reflections, slightly different per side.
room = np.zeros_like(out)
for d, g in [(0.023, 0.18), (0.037, 0.14), (0.061, 0.1), (0.089, 0.07), (0.131, 0.05)]:
    k = int(d * SR)
    room[k:, 0] += out[:-k, 0] * g
    k2 = int((d * 1.13) * SR)
    room[k2:, 1] += out[:-k2, 1] * g
out = out + room
L = int(LENGTH * SR)
loop = out[:L].copy()
loop[: N - L] += out[L:]
loop /= max(1e-9, np.max(np.abs(loop))) / 0.89
pcm = (np.clip(loop, -1, 1) * 32767).astype(np.int16)

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
wav = os.path.join('/tmp', 'high-roller-lounge.wav')
with wave.open(wav, 'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
dest = os.path.join(root, 'public', 'music', 'high-roller-lounge.mp3')
subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav, '-codec:a', 'libmp3lame', '-b:a', '192k', dest], check=True)
print(f'{dest}: {LENGTH:.1f} s, {BARS} bars at {BPM} bpm', file=sys.stderr)
