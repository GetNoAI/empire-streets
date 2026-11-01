#!/usr/bin/env python3
"""
Zone music: one free-roam track per part of the city, synthesised from scratch (numpy/scipy),
following the zone music brief (style, tempo, palette per zone).

Every track is a seamless loop (the tails of the last bar are folded back onto the start), about
2-2.5 minutes, instrumental, normalised to about -14 LUFS with a -1 dBTP ceiling (ffmpeg's
loudness meter measures it, then a plain gain sets it, so the loop point isn't touched).

  python3 scripts/make-zone-tracks.py                 -> every zone in public/music/zone-*.mp3
  python3 scripts/make-zone-tracks.py harlow glass    -> just those

These are placeholders made in code; drop better files over them with the same names any time.
"""
import json
import math
import os
import re
import subprocess
import sys
import wave

import numpy as np
from scipy.signal import butter, lfilter, sosfilt

SR = 44100
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NOTE = {'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3, 'E': 4, 'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8, 'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11}
QUAL = {
    'maj7': [0, 4, 7, 11], 'maj9': [0, 4, 7, 11, 14], '7': [0, 4, 7, 10], '9': [0, 4, 7, 10, 14], 'm7': [0, 3, 7, 10],
    'm9': [0, 3, 7, 10, 14], 'm': [0, 3, 7], 'M': [0, 4, 7], '6': [0, 4, 7, 9], 'm6': [0, 3, 7, 9], 'sus': [0, 5, 7, 10], 'dim': [0, 3, 6, 9],
}
SCALES = {'major': [0, 2, 4, 5, 7, 9, 11], 'minor': [0, 2, 3, 5, 7, 8, 10], 'dorian': [0, 2, 3, 5, 7, 9, 10], 'phrygian': [0, 1, 3, 5, 7, 8, 10], 'penta': [0, 3, 5, 7, 10], 'majpenta': [0, 2, 4, 7, 9]}


def hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def parse(ch):
    m = re.match(r'([A-G][b#]?)(.*)', ch)
    return NOTE[m.group(1)], (m.group(2) or 'M')


# ---------------------------------------------------------------- building blocks
class Song:
    def __init__(self, z):
        self.z = z
        self.bpm = z['bpm']
        self.beat = 60 / self.bpm
        self.bar = self.beat * 4
        self.bars = z.get('bars') or int(round(140 / self.bar / 8)) * 8
        self.length = self.bars * self.bar
        self.n = int((self.length + 4.0) * SR)
        self.rng = np.random.default_rng(abs(hash(z['id'])) % 2**32)
        self.bus = {}
        self.swing = z.get('swing', 0.5)

    def add(self, bus, t0, sig, gain=1.0):
        b = self.bus.setdefault(bus, np.zeros(self.n))
        i = int(t0 * SR)
        if i >= self.n or i < 0:
            return
        j = min(self.n, i + len(sig))
        b[i:j] += sig[: j - i] * gain

    def t(self, bar, beat):
        """Time of a beat (fractions allowed) in a bar, with swing on the off eighths and sixteenths."""
        whole = math.floor(beat)
        frac = beat - whole
        if abs(frac - 0.5) < 1e-6:
            frac = self.swing
        elif abs(frac - 0.25) < 1e-6:
            frac = self.swing / 2
        elif abs(frac - 0.75) < 1e-6:
            frac = self.swing + (1 - self.swing) / 2
        return bar * self.bar + (whole + frac) * self.beat

    def chord(self, bar, beat=0):
        prog = self.z['chords']
        per = self.z.get('chordBars', 1)
        idx = (bar // per) % len(prog)
        c = prog[idx]
        if isinstance(c, list):
            c = c[0] if beat < 2 else c[1]
        return parse(c)

    def section(self, bar):
        """Arrangement: 8-bar phrases cycling through the zone's plan (which layers play)."""
        plan = self.z.get('plan', ['A', 'B', 'A', 'C'])
        return plan[(bar // 8) % len(plan)]


def env(n, a, d, s=0.0, rel=None):
    t = np.arange(n) / SR
    e = np.where(t < a, t / max(a, 1e-4), s + (1 - s) * np.exp(-(t - a) / max(d, 1e-4)))
    if rel is not None and int(rel * SR) < n:
        k = int(rel * SR)
        e[k:] *= np.exp(-np.arange(n - k) / SR / 0.06)
    return e


def lp(sig, f, order=2):
    return sosfilt(butter(order, min(f, SR * 0.45), 'low', fs=SR, output='sos'), sig)


def hpf(sig, f, order=2):
    return sosfilt(butter(order, f, 'high', fs=SR, output='sos'), sig)


def bp(sig, lo, hi, order=2):
    return sosfilt(butter(order, [lo, hi], 'band', fs=SR, output='sos'), sig)


def osc(kind, f, n, ph0=0.0, glide=None):
    t = np.arange(n) / SR
    if glide is not None:
        fr = glide(t)
        ph = 2 * np.pi * np.cumsum(fr) / SR
    else:
        ph = 2 * np.pi * f * t + ph0
    if kind == 'sine':
        return np.sin(ph)
    if kind == 'tri':
        return 2 / np.pi * np.arcsin(np.sin(ph))
    if kind == 'saw':
        return 2 * ((ph / (2 * np.pi)) % 1) - 1
    if kind == 'square':
        return np.sign(np.sin(ph))
    if kind == 'pulse':
        return np.where((ph / (2 * np.pi)) % 1 < 0.25, 1.0, -1.0)
    raise ValueError(kind)


# ---- instruments (each returns a mono signal)
def i_epiano(f, dur, vel=1.0):
    n = int((dur + 0.6) * SR)
    t = np.arange(n) / SR
    idx = 1.6 * np.exp(-t / 0.3) + 0.2
    sig = np.sin(2 * np.pi * f * t + np.sin(2 * np.pi * f * t) * idx) + np.sin(2 * np.pi * f * 14 * t) * np.exp(-t / 0.02) * 0.07
    sig *= 1 + 0.1 * np.sin(2 * np.pi * 4.5 * t)
    return sig * env(n, 0.004, 1.0, 0.15, dur) * 0.14 * vel


def i_piano(f, dur, vel=1.0):
    n = int((dur + 1.2) * SR)
    t = np.arange(n) / SR
    sig = sum(a * np.sin(2 * np.pi * f * k * t * (1 + 0.0004 * k * k)) * np.exp(-t * (0.6 + 0.9 * k)) for k, a in [(1, 1), (2, 0.45), (3, 0.25), (4, 0.12), (5, 0.06)])
    sig += np.random.default_rng(int(f)).standard_normal(n) * np.exp(-t / 0.004) * 0.05
    return sig * env(n, 0.002, 3.0, 0.0, dur + 0.3) * 0.17 * vel


def i_pad(f, dur, vel=1.0, bright=1800):
    n = int((dur + 0.9) * SR)
    sig = sum(osc('saw', f * d, n) for d in (0.996, 1.0, 1.005)) / 3
    sig = lp(sig, bright)
    a = min(0.5, dur * 0.3)
    e = np.minimum(1, np.arange(n) / SR / a) * np.where(np.arange(n) / SR > dur, np.exp(-(np.arange(n) / SR - dur) / 0.35), 1)
    return sig * e * 0.07 * vel


def i_organ(f, dur, vel=1.0):
    n = int((dur + 0.15) * SR)
    t = np.arange(n) / SR
    sig = sum(a * np.sin(2 * np.pi * f * k * t) for k, a in [(0.5, 0.5), (1, 1), (2, 0.6), (3, 0.3), (4, 0.25)])
    sig *= 1 + 0.15 * np.sin(2 * np.pi * 6.2 * t)
    e = np.minimum(1, t / 0.01) * np.where(t > dur, np.exp(-(t - dur) / 0.05), 1)
    return sig * e * 0.05 * vel


def i_pluck(f, dur, vel=1.0, bright=0.5, decay=0.996):
    """Karplus-Strong string (guitar, harp, pizzicato)."""
    n = int((dur + 0.8) * SR)
    p = max(2, int(SR / f))
    burst = np.random.default_rng(int(f * 7)).standard_normal(p)
    burst = lp(np.concatenate([burst, np.zeros(n - p)]), 2000 + 8000 * bright)
    a = np.zeros(p + 2)
    a[0] = 1
    a[p] = -decay * 0.5
    a[p + 1] = -decay * 0.5
    sig = lfilter([1.0], a, burst)
    e = np.where(np.arange(n) / SR > dur, np.exp(-(np.arange(n) / SR - dur) / 0.08), 1)
    return sig * e * 0.25 * vel


def i_vibes(f, dur, vel=1.0):
    n = int(max(dur, 0.8) * SR)
    t = np.arange(n) / SR
    sig = np.sin(2 * np.pi * f * t) + 0.2 * np.sin(2 * np.pi * f * 4 * t) * np.exp(-t / 0.15)
    sig *= 1 + 0.3 * np.sin(2 * np.pi * 5.5 * t)
    return sig * env(n, 0.003, 1.0) * 0.2 * vel


def i_bell(f, dur=1.6, vel=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    sig = sum(a * np.sin(2 * np.pi * f * k * t) * np.exp(-t / (0.9 / k)) for k, a in [(1, 1), (2.0, 0.4), (2.76, 0.5), (5.4, 0.25), (8.9, 0.1)])
    return sig * 0.08 * vel


def i_flute(f, dur, vel=1.0):
    n = int((dur + 0.2) * SR)
    t = np.arange(n) / SR
    vib = 1 + 0.008 * np.sin(2 * np.pi * 5 * t) * np.clip(t / 0.3, 0, 1)
    ph = 2 * np.pi * f * np.cumsum(vib) / SR
    sig = np.sin(ph) + 0.15 * np.sin(2 * ph) + 0.05 * np.sin(3 * ph)
    breath = bp(np.random.default_rng(int(f)).standard_normal(n), f * 0.8, f * 2.5) * 0.08
    e = np.minimum(1, t / 0.06) * np.where(t > dur, np.exp(-(t - dur) / 0.08), 1)
    return (sig + breath) * e * 0.12 * vel


def i_horn(f, dur, vel=1.0, mute=True):
    n = int((dur + 0.1) * SR)
    t = np.arange(n) / SR
    vib = 1 + 0.006 * np.sin(2 * np.pi * 5.2 * t) * np.clip(t / 0.25, 0, 1)
    ph = 2 * np.pi * f * np.cumsum(vib) / SR
    harm = [(1, 0.35), (2, 0.5), (3, 0.6), (4, 0.45), (5, 0.3), (6, 0.18), (7, 0.1)] if mute else [(1, 1), (2, 0.7), (3, 0.5), (4, 0.35), (5, 0.25), (6, 0.15)]
    sig = sum(a * np.sin(k * ph) for k, a in harm)
    e = np.minimum(1, t / 0.035) * np.where(t > dur, np.exp(-(t - dur) / 0.05), 1)
    return sig * e * 0.06 * vel


def i_brass_stab(f, dur, vel=1.0):
    n = int((dur + 0.15) * SR)
    sig = sum(osc('saw', f * d, n) for d in (0.995, 1.0, 1.006))
    t = np.arange(n) / SR
    cut = 600 + 3500 * np.exp(-t / 0.08)
    # A swept filter, done in chunks.
    out = np.zeros(n)
    for k in range(0, n, 2048):
        out[k:k + 2048] = lp(sig[max(0, k - 512):k + 2048], cut[k])[-len(sig[k:k + 2048]):]
    e = np.minimum(1, t / 0.01) * np.where(t > dur, np.exp(-(t - dur) / 0.06), 1)
    return out * e * 0.05 * vel


def i_square_lead(f, dur, vel=1.0):
    n = int((dur + 0.05) * SR)
    t = np.arange(n) / SR
    sig = osc('pulse' if f > 600 else 'square', f, n) * (1 + 0.0 * t)
    e = np.minimum(1, t / 0.003) * np.where(t > dur * 0.9, np.exp(-(t - dur * 0.9) / 0.02), 1)
    return lp(sig, 7000) * e * 0.05 * vel


def i_reed(f, dur, vel=1.0):
    """Melodica: a reedy square-ish tone with breath."""
    n = int((dur + 0.1) * SR)
    t = np.arange(n) / SR
    sig = lp(osc('square', f, n) * 0.6 + osc('saw', f * 1.003, n) * 0.4, 2500)
    e = np.minimum(1, t / 0.03) * np.where(t > dur, np.exp(-(t - dur) / 0.06), 1)
    return sig * e * 0.07 * vel


def i_slide(f, dur, vel=1.0):
    """Slide guitar: a bent pluck that glides up into the note."""
    n = int((dur + 0.4) * SR)
    t = np.arange(n) / SR
    glide = lambda tt: f * (2 ** (-1.5 / 12 * np.exp(-tt / 0.08))) * (1 + 0.004 * np.sin(2 * np.pi * 5.5 * tt))
    sig = osc('saw', f, n, glide=glide) * 0.5 + osc('tri', f, n, glide=glide) * 0.5
    sig = lp(sig, 2200)
    return sig * env(n, 0.005, 1.2, 0.2, dur) * 0.08 * vel


def i_chip_arp(f, dur, vel=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    return osc('pulse', f, n) * np.exp(-t / 0.08) * 0.035 * vel


def i_guitar_scratch(f, dur, vel=1.0):
    n = int(0.09 * SR)
    sig = bp(np.random.default_rng(int(f * 3)).standard_normal(n), 1200, 3800) * 0.6 + osc('saw', f, n) * 0.4
    return sig * env(n, 0.002, 0.03) * 0.08 * vel


def i_choir(f, dur, vel=1.0):
    n = int((dur + 0.8) * SR)
    t = np.arange(n) / SR
    sig = sum(osc('saw', f * d, n) for d in (0.993, 1.0, 1.007, 2.003))
    sig = bp(sig, 350, 1300) + 0.5 * bp(sig, 2200, 3000)
    e = np.minimum(1, t / 0.4) * np.where(t > dur, np.exp(-(t - dur) / 0.4), 1)
    return sig * e * 0.025 * vel


INSTR = {
    'epiano': i_epiano, 'piano': i_piano, 'pad': i_pad, 'organ': i_organ, 'pluck': i_pluck, 'vibes': i_vibes,
    'bell': i_bell, 'flute': i_flute, 'horn': i_horn, 'brass': i_brass_stab, 'square': i_square_lead, 'reed': i_reed,
    'slide': i_slide, 'chip': i_chip_arp, 'scratch': i_guitar_scratch, 'choir': i_choir,
    'pizz': lambda f, d, v=1.0: i_pluck(f, min(d, 0.25), v * 1.2, 0.3, 0.98),
    'kalimba': lambda f, d, v=1.0: i_bell(f, 0.9, v * 0.8),
    'openhorn': lambda f, d, v=1.0: i_horn(f, d, v * 0.9, False),
    'strings': lambda f, d, v=1.0: i_pad(f, d, v * 0.9, 2600),
}


# ---- drums
def drum_kit(rng, style):
    t = lambda s: np.arange(int(s * SR)) / SR
    k = t(0.45)
    kick_f = {'trap': (40, 90, 0.05, 0.4), 'boombap': (50, 80, 0.035, 0.18), 'soft': (55, 60, 0.03, 0.14), 'disco': (52, 95, 0.03, 0.2), 'dub': (48, 70, 0.04, 0.3)}.get(style, (50, 80, 0.035, 0.18))
    kick = np.sin(2 * np.pi * np.cumsum(kick_f[0] + kick_f[1] * np.exp(-k / kick_f[2])) / SR) * np.exp(-k / kick_f[3])
    kick += np.exp(-k / 0.004) * 0.3 * rng.standard_normal(len(k))
    s = t(0.35)
    snare = lp(rng.standard_normal(len(s)), 7000) * np.exp(-s / (0.09 if style != 'soft' else 0.06)) * 0.5 + np.sin(2 * np.pi * 190 * s) * np.exp(-s / 0.05) * 0.5
    if style == 'boombap':
        snare = lp(snare, 4500)
    h = t(0.08)
    hat = hpf(rng.standard_normal(len(h)), 7000) * np.exp(-h / 0.018) * 0.35
    oh = t(0.35)
    ohat = hpf(rng.standard_normal(len(oh)), 6000) * np.exp(-oh / 0.12) * 0.25
    c = t(0.3)
    clap = sum(np.concatenate([np.zeros(int(d * SR)), bp(rng.standard_normal(len(c)), 900, 4000) * np.exp(-c / 0.05)])[: len(c)] for d in (0, 0.009, 0.019)) * 0.45
    rim = np.sin(2 * np.pi * 1700 * t(0.05)) * np.exp(-t(0.05) / 0.008) * 0.4
    shaker = bp(rng.standard_normal(int(0.07 * SR)), 5000, 10000) * env(int(0.07 * SR), 0.015, 0.025) * 0.18
    return dict(kick=kick, snare=snare, hat=hat, ohat=ohat, clap=clap, rim=rim, shaker=shaker)


def drums(S, kit, style, bars_on):
    rng = S.rng
    for bar in range(S.bars):
        if not bars_on(bar):
            continue
        last = bar % 8 == 7
        if style in ('boombap', 'soft'):
            kp = [0, 1.75, 2.5] if bar % 2 == 0 else [0, 0.75, 2.25, 2.5]
            for b in kp:
                S.add('drums', S.t(bar, b), kit['kick'], 0.8 if style == 'boombap' else 0.55)
            for b in (1, 3):
                S.add('drums', S.t(bar, b) + 0.01, kit['snare'], 0.6 if style == 'boombap' else 0.35)
            for e in range(8):
                S.add('drums', S.t(bar, e / 2), kit['hat'], (0.5 if e % 2 == 0 else 0.3) * (0.8 + 0.4 * rng.random()))
            if last:
                S.add('drums', S.t(bar, 3.75), kit['snare'], 0.3)
        elif style == 'trap':
            kp = [0, 1.5, 2.75] if bar % 2 == 0 else [0, 0.75, 2.5, 3.25]
            for b in kp:
                S.add('drums', S.t(bar, b), kit['kick'], 0.85)
            S.add('drums', S.t(bar, 2), kit['clap'], 0.6)
            S.add('drums', S.t(bar, 2), kit['snare'], 0.35)
            step = 0.5
            b = 0.0
            while b < 4:
                roll = rng.random() < 0.12
                if roll:
                    for k in range(3):
                        S.add('drums', S.t(bar, 0) + (b + k / 6) * S.beat, kit['hat'], 0.3)
                else:
                    S.add('drums', S.t(bar, 0) + b * S.beat, kit['hat'], 0.38 if (b * 2) % 2 == 0 else 0.25)
                b += step
        elif style == 'disco':
            for b in range(4):
                S.add('drums', S.t(bar, b), kit['kick'], 0.75)
                S.add('drums', S.t(bar, b + 0.5), kit['ohat'], 0.4)
                S.add('drums', S.t(bar, b + 0.25), kit['hat'], 0.2)
                S.add('drums', S.t(bar, b + 0.75), kit['hat'], 0.2)
            for b in (1, 3):
                S.add('drums', S.t(bar, b), kit['clap'], 0.5)
                S.add('drums', S.t(bar, b), kit['snare'], 0.3)
        elif style == 'garage':
            for b in (0, 2.75):
                S.add('drums', S.t(bar, b), kit['kick'], 0.75)
            if bar % 2:
                S.add('drums', S.t(bar, 1.5), kit['kick'], 0.45)
            for b in (1, 3):
                S.add('drums', S.t(bar, b), kit['clap'], 0.45)
                S.add('drums', S.t(bar, b), kit['rim'], 0.3)
            for e in range(16):
                if e % 4 == 2 or rng.random() < 0.45:
                    S.add('drums', S.t(bar, e / 4), kit['hat'], 0.22 + 0.15 * (e % 4 == 2))
            S.add('drums', S.t(bar, 0), kit['shaker'], 0.5)
        elif style == 'dub':
            # One drop: kick and rim together on beat 3; skanking hats.
            S.add('drums', S.t(bar, 2), kit['kick'], 0.85)
            S.add('drums', S.t(bar, 2), kit['rim'], 0.5)
            S.add('fxsnare', S.t(bar, 2), kit['snare'], 0.25)
            for e in range(8):
                S.add('drums', S.t(bar, e / 2), kit['hat'], 0.25 if e % 2 else 0.15)
        elif style == 'breaks':
            for b in (0, 1.75, 2.5):
                S.add('drums', S.t(bar, b), kit['kick'], 0.55)
            for b in (1, 3):
                S.add('drums', S.t(bar, b), kit['snare'], 0.4)
            S.add('drums', S.t(bar, 3.75), kit['snare'], 0.15)
            for e in range(16):
                S.add('drums', S.t(bar, e / 4), kit['hat'], 0.12 + 0.12 * (e % 2 == 0))
        elif style == 'chip':
            for b in range(4):
                S.add('drums', S.t(bar, b), kit['kick'], 0.6)
                S.add('drums', S.t(bar, b + 0.5), kit['hat'], 0.3)
            for b in (1, 3):
                S.add('drums', S.t(bar, b), kit['snare'], 0.45)
        elif style == 'heavy':
            # Slow and sparse: a heartbeat kick and a distant hit.
            S.add('drums', S.t(bar, 0), kit['kick'], 0.8)
            S.add('drums', S.t(bar, 0.4), kit['kick'], 0.45)
            if bar % 2:
                S.add('drums', S.t(bar, 2), lp(kit['snare'], 1500), 0.7)


# ---- parts
def voicing(root, qual, base=55, top=74):
    out = []
    last = base - 1
    for iv in QUAL[qual][1:] + [QUAL[qual][0] + 12]:
        m = base + ((root + iv - base) % 12)
        while m <= last:
            m += 12
        if m > top:
            m -= 12
        out.append(m)
        last = m
    return sorted(set(out))


def bass_part(S, style, bars_on):
    prev = 40
    for bar in range(S.bars):
        if not bars_on(bar):
            continue
        r, q = S.chord(bar)
        root = 33 + ((r - 9) % 12)  # A1..G#2
        if style == 'sub':
            for b, d in [(0, 1.5), (2.5, 1.0)]:
                S.add('bass', S.t(bar, b), lp(osc('sine', hz(root + 12), int(d * S.beat * SR)), 300) * env(int(d * S.beat * SR), 0.01, 3, 0.8, d * S.beat * 0.9), 0.32)
        elif style == '808':
            for b, d in [(0, 1.4), (1.5, 0.9), (2.75, 1.1)]:
                n = int(d * S.beat * SR)
                f = hz(root + 12)
                g = lambda tt, f=f: f * (1 + 0.6 * np.exp(-tt / 0.03))
                sig = np.tanh(2.5 * osc('sine', f, n, glide=g)) * env(n, 0.003, 0.6, 0.5, d * S.beat * 0.9)
                S.add('bass', S.t(bar, b), sig, 0.26)
        elif style in ('upright', 'walking'):
            beats = range(4) if style == 'walking' else (0, 2, 3)
            for b in beats:
                rr, qq = S.chord(bar, b)
                tones = [36 + ((rr + iv) % 12) for iv in QUAL[qq][:3]]
                target = 36 + rr if b == 0 else min(tones + [x + 12 for x in tones], key=lambda m: abs(m - prev) + S.rng.random() * 3)
                prev = target
                n = int(S.beat * 0.95 * SR)
                tt = np.arange(n) / SR
                f = hz(target)
                sig = (np.sin(2 * np.pi * f * tt) + 0.35 * np.sin(4 * np.pi * f * tt) + 0.1 * np.sin(6 * np.pi * f * tt)) * env(n, 0.006, 0.35, 0.25, S.beat * 0.85)
                S.add('bass', S.t(bar, b), sig, 0.32)
        elif style == 'funk':
            pat = [(0, 0), (0.75, 12), (1.5, 0), (2, 7), (2.5, 12), (3.25, 10), (3.5, 0)]
            for b, iv in pat:
                n = int(0.22 * SR)
                sig = lp(osc('saw', hz(root + 12 + iv), n), 900) * env(n, 0.003, 0.12, 0.2, 0.18)
                S.add('bass', S.t(bar, b), sig, 0.3)
        elif style == 'dub':
            pat = [(0, 0, 1.0), (1, 7, 0.5), (1.5, 12, 0.5), (2.5, 10, 0.5), (3, 7, 1.0)]
            for b, iv, d in pat:
                n = int(d * S.beat * SR)
                sig = lp(osc('sine', hz(root + iv), n) + 0.3 * osc('tri', hz(root + iv), n), 250) * env(n, 0.01, 2, 0.8, d * S.beat * 0.9)
                S.add('bass', S.t(bar, b), sig, 0.42)
        elif style == 'octave':
            for e in range(8):
                n = int(S.beat * 0.45 * SR)
                m = root + 12 + (12 if e % 2 else 0)
                sig = lp(osc('saw', hz(m), n) + osc('square', hz(m) * 1.002, n), 1400) * env(n, 0.002, 0.1, 0.3, S.beat * 0.4)
                S.add('bass', S.t(bar, e / 2), sig, 0.12)
        elif style == 'drone':
            if bar % 4 == 0:
                n = int(4 * S.bar * SR)
                tt = np.arange(n) / SR
                sig = (osc('sine', hz(root), n) + 0.5 * osc('saw', hz(root) * 1.004, n)) * (0.7 + 0.3 * np.sin(2 * np.pi * 0.09 * tt))
                sig = lp(sig, 220) * np.minimum(1, tt / 1.5) * np.minimum(1, (4 * S.bar - tt) / 1.5 + 0.0)
                S.add('bass', S.t(bar, 0), np.clip(sig, -2, 2), 0.35)


def chords_part(S, instr, rhythm, bars_on, base=55, vel=1.0):
    fn = INSTR[instr]
    for bar in range(S.bars):
        if not bars_on(bar):
            continue
        for b, d in rhythm(bar):
            r, q = S.chord(bar, b)
            for m in voicing(r, q, base, base + 19):
                S.add('chords', S.t(bar, b) + S.rng.random() * 0.006, fn(hz(m), d * S.beat, vel * (0.85 + 0.25 * S.rng.random())))


def melody_part(S, instr, scale, bars_on, lo=67, hi=84, density=0.6, bus='lead', vel=1.0, motif_bars=2, rest=0.25):
    """A motif of `motif_bars` bars, repeated and varied, snapped to chord tones on strong beats."""
    fn = INSTR[instr]
    key = S.z['key']
    pcs = [(key + iv) % 12 for iv in SCALES[scale]]
    cands_all = [m for m in range(lo, hi + 1) if m % 12 in pcs]
    rng = S.rng
    motif = []
    pos = 0.0
    cur = cands_all[len(cands_all) // 2]
    while pos < motif_bars * 4:
        if rng.random() < rest:
            pos += 0.5
            continue
        length = rng.choice([0.5, 0.5, 1.0, 1.0, 1.5, 2.0]) if density < 0.8 else rng.choice([0.25, 0.5, 0.5, 1.0])
        step = int(rng.integers(-3, 4))
        motif.append((pos, step, length))
        pos += length
    for bar in range(0, S.bars, motif_bars):
        if not bars_on(bar):
            continue
        variant = (bar // motif_bars) % 4
        for pos, step, length in motif:
            if variant == 3 and pos >= motif_bars * 2:
                continue
            if rng.random() > density + 0.35:
                continue
            b_bar = bar + int(pos // 4)
            beat = pos % 4
            r, q = S.chord(b_bar, beat)
            idx = max(0, min(len(cands_all) - 1, cands_all.index(min(cands_all, key=lambda m: abs(m - cur))) + step + (1 if variant == 1 else 0)))
            m = cands_all[idx]
            if beat in (0, 2):
                tones = [x for x in cands_all if (x - r) % 12 in [iv % 12 for iv in QUAL[q]]]
                if tones:
                    m = min(tones, key=lambda x: abs(x - m))
            cur = m
            S.add(bus, S.t(b_bar, beat), fn(hz(m), length * S.beat * 0.92, vel))


# ---- effects and ambience
def reverb(sig, size=1.0, damp=4000):
    out = np.zeros_like(sig)
    for d, g in [(0.0297, 0.78), (0.0371, 0.77), (0.0411, 0.76), (0.0437, 0.75)]:
        k = int(d * size * SR)
        a = np.zeros(k + 1)
        a[0] = 1
        a[k] = -g * min(0.97, 0.88 + 0.06 * size)
        out += lfilter([1.0], a, sig)
    for d, g in [(0.005, 0.7), (0.0017, 0.7)]:
        k = int(d * SR)
        b = np.zeros(k + 1)
        b[0] = -g
        b[k] = 1
        a = np.zeros(k + 1)
        a[0] = 1
        a[k] = -g
        out = lfilter(b, a, out)
    return lp(out, damp) * 0.25


def echo(sig, delay, fb=0.45, damp=2500):
    k = int(delay * SR)
    a = np.zeros(k + 1)
    a[0] = 1
    a[k] = -fb
    wet = lfilter([1.0], a, sig) - sig
    return lp(wet, damp)


def crackle(n, rng, amt=1.0):
    pops = (rng.random(n) < 0.0004) * rng.standard_normal(n) * 0.6
    hiss = hpf(rng.standard_normal(n), 3000) * 0.012
    return (hpf(pops, 1500) + hiss) * amt


def wind(n, rng, amt=1.0):
    w = rng.standard_normal(n)
    sw = 0.5 + 0.5 * np.sin(2 * np.pi * np.cumsum(0.05 + 0.04 * np.sin(np.arange(n) / SR * 0.3)) / SR)
    return bp(w, 200, 900) * sw * 0.05 * amt


def drips(S, rng, rate=0.6):
    for _ in range(int(S.length * rate)):
        t0 = rng.random() * S.length
        f = 900 + 1400 * rng.random()
        n = int(0.12 * SR)
        tt = np.arange(n) / SR
        sig = np.sin(2 * np.pi * np.cumsum(f * (1 + 1.2 * np.exp(-tt / 0.01))) / SR) * np.exp(-tt / 0.03)
        S.add('fx', t0, sig, 0.09 * (0.4 + rng.random()))


def horn_call(S, t0, f=110, dur=2.2, gain=0.12):
    n = int(dur * SR)
    tt = np.arange(n) / SR
    sig = sum(a * osc('saw', f * k, n) for k, a in [(1, 1), (1.5, 0.6), (2, 0.4)])
    sig = lp(sig, 700) * np.minimum(1, tt / 0.25) * np.minimum(1, (dur - tt) / 0.5)
    S.add('fx', t0, sig, gain)


def gulls(S, rng, count):
    for _ in range(count):
        t0 = rng.random() * S.length
        n = int(0.35 * SR)
        tt = np.arange(n) / SR
        g = lambda x: 1400 + 900 * np.sin(np.pi * np.clip(x / 0.3, 0, 1)) - 600 * x
        sig = bp(osc('saw', 0, n, glide=g), 900, 3500) * np.sin(np.pi * np.clip(tt / 0.33, 0, 1))
        for k in range(rng.integers(1, 4)):
            S.add('fx', t0 + k * 0.32, sig, 0.03)


def chirps(S, rng, count):
    for _ in range(count):
        t0 = rng.random() * S.length
        for k in range(rng.integers(2, 5)):
            n = int(0.06 * SR)
            tt = np.arange(n) / SR
            f0 = 3000 + 2000 * rng.random()
            g = lambda x, f0=f0: f0 + 1500 * x / 0.06
            S.add('fx', t0 + k * 0.09, osc('sine', 0, n, glide=g) * np.sin(np.pi * tt / 0.06), 0.025)


def clanks(S, rng, count):
    for _ in range(count):
        t0 = rng.random() * S.length
        n = int(0.6 * SR)
        tt = np.arange(n) / SR
        sig = sum(np.sin(2 * np.pi * f * tt) * np.exp(-tt / d) for f, d in [(rng.uniform(300, 500), 0.25), (rng.uniform(900, 1300), 0.12), (rng.uniform(2100, 2900), 0.06)])
        S.add('fx', t0, sig, 0.05)


def scrapes(S, rng, count):
    for _ in range(count):
        t0 = rng.random() * S.length
        n = int(rng.uniform(1.0, 2.5) * SR)
        tt = np.arange(n) / SR
        sig = bp(rng.standard_normal(n), 1800, 4200) * (0.5 + 0.5 * np.sin(2 * np.pi * 9 * tt)) * np.sin(np.pi * tt / tt[-1])
        S.add('fx', t0, sig, 0.03)


def chains(S, rng, bars):
    for bar in bars:
        t0 = S.t(bar, 3.5)
        for k in range(6):
            n = int(0.05 * SR)
            sig = bp(rng.standard_normal(n), 2500, 7000) * np.exp(-np.arange(n) / SR / 0.012)
            S.add('fx', t0 + k * 0.03 + rng.random() * 0.01, sig, 0.12)


# ---------------------------------------------------------------- the zones (see the Zone Music Brief)
ZONES = [
    dict(id='harlow-heights', bpm=88, swing=0.6, key=NOTE['Eb'], chords=['Ebmaj7', 'Cm7', 'Fm7', 'Bb9'], drums='boombap', bass='upright',
         keys=('epiano', 'soul'), lead=('vibes', 'major', 0.45), fx=['crackle', 'church'], plan=['A', 'B', 'B', 'C']),
    dict(id='sutton-row', bpm=94, swing=0.64, key=NOTE['F'], chords=['Fmaj7', 'Dm7', 'Gm7', 'C9'], drums='soft', bass='walking',
         keys=('piano', 'comp'), pad='strings', lead=('horn', 'major', 0.5), plan=['A', 'B', 'A', 'B']),
    dict(id='hells-galley', bpm=110, key=NOTE['A'], chords=['Am7', 'D9', 'Fmaj7', 'E7'], drums='disco', bass='funk',
         keys=('scratch', 'scratch'), pad='pad', stabs=True, lead=('brass', 'dorian', 0.5), plan=['A', 'B', 'B', 'C']),
    dict(id='glass-district', bpm=120, key=NOTE['C#'], chords=['C#m9', 'Amaj9', 'Emaj7', 'B6'], drums='garage', bass='sub',
         keys=('pluck', 'arp'), pad='pad', lead=('bell', 'minor', 0.35), fx=['ticks'], plan=['A', 'B', 'B', 'C']),
    dict(id='canal-yards', bpm=82, key=NOTE['F'], chords=['Fm', 'Dbmaj7', 'Bbm', 'C7'], drums='trap', bass='808',
         keys=('piano', 'loop'), lead=None, fx=['clanks', 'train'], plan=['A', 'B', 'B', 'C']),
    dict(id='old-battery', bpm=90, swing=0.57, key=NOTE['D'], chords=['Dm', 'Bbmaj7', 'Gm7', 'A7'], drums='boombap', bass='upright',
         keys=('pizz', 'pizz'), pad='strings', lead=('openhorn', 'minor', 0.35), fx=['ferry', 'ticks'], plan=['A', 'B', 'A', 'C']),
    dict(id='central-green', bpm=80, swing=0.58, key=NOTE['G'], chords=['Gmaj7', 'Em7', 'Cmaj7', 'D6'], drums='soft', bass='upright',
         keys=('pluck', 'guitar'), lead=('flute', 'majpenta', 0.45), fx=['birds', 'kalimba'], plan=['A', 'B', 'B', 'C']),
    dict(id='waterfront', bpm=92, key=NOTE['A'], chords=['Am', 'Dm7', 'Am', 'Em7'], drums='dub', bass='dub',
         keys=('organ', 'skank'), lead=('reed', 'penta', 0.45), slide=True, fx=['gulls', 'wind', 'ship'], plan=['A', 'B', 'B', 'C']),
    dict(id='rooftops', bpm=100, key=NOTE['E'], chords=['Emaj9', 'C#m9', 'Amaj7', 'B6'], chordBars=2, drums='breaks', bass='sub',
         keys=('pad', 'wash'), lead=('pluck', 'majpenta', 0.55), fx=['wind'], plan=['A', 'B', 'B', 'C']),
    dict(id='sewer-deep', bpm=64, key=NOTE['C'], chords=['Cm', 'Dbmaj7', 'Cm', 'Gdim'], chordBars=2, drums='heavy', bass='drone',
         keys=('pad', 'dark'), lead=('piano', 'phrygian', 0.18), fx=['drips', 'scrapes', 'growl'], plan=['A', 'B', 'B', 'C']),
    dict(id='gutter-kings-hideout', bpm=74, key=NOTE['G'], chords=['Gm', 'Ebmaj7', 'Cm', 'D7'], drums='trap', bass='808',
         keys=('organ', 'hold'), pad='choir', lead=('openhorn', 'minor', 0.3), fx=['chains'], plan=['A', 'B', 'B', 'C']),
    dict(id='shops', bpm=98, swing=0.55, key=NOTE['Bb'], chords=['Bbmaj7', 'Gm7', 'Cm7', 'F9'], drums='boombap', bass='funk',
         keys=('epiano', 'soul'), lead=('pluck', 'major', 0.45), radio=True, plan=['A', 'B', 'A', 'B']),
    dict(id='arcade', bpm=128, key=NOTE['E'], chords=['Em', 'C', 'G', 'D'], drums='chip', bass='octave',
         keys=('chip', 'arp16'), lead=('square', 'minor', 0.8), plan=['A', 'B', 'B', 'C']),
]


def render(z):
    S = Song(z)
    rng = S.rng
    kit = drum_kit(rng, z['drums'] if z['drums'] in ('trap', 'boombap', 'soft', 'disco', 'dub') else 'boombap')
    sec = S.section
    # Section plan: A = groove without the lead, B = everything, C = breakdown (no drums, thin bass).
    drums(S, kit, z['drums'], lambda b: sec(b) != 'C' or b % 8 >= 6)
    bass_part(S, z['bass'], lambda b: sec(b) != 'C' or b % 2 == 0)
    instr, rh = z['keys']
    rhythms = {
        'soul': lambda bar: [(0, 1.5), (1.5, 0.5), (2.5, 1.2)] if bar % 2 == 0 else [(0.5, 1), (2, 1.5), (3.5, 0.5)],
        'comp': lambda bar: [(0, 1), (1.5, 0.5), (2.5, 1)],
        'scratch': lambda bar: [(e / 4, 0.1) for e in range(16) if e % 4 in (1, 2, 3) and (e * 7 + bar) % 5],
        'arp': None,
        'loop': lambda bar: [(0, 0.75), (0.75, 0.75), (1.5, 1), (3, 0.5), (3.5, 0.5)],
        'pizz': lambda bar: [(e / 2, 0.25) for e in range(8)],
        'guitar': None,
        'skank': lambda bar: [(1.5, 0.3), (3.5, 0.3)],
        'wash': lambda bar: [(0, 4)] if bar % 2 == 0 else [],
        'dark': lambda bar: [(0, 8)] if bar % 2 == 0 else [],
        'hold': lambda bar: [(0, 4)],
        'arp16': None,
    }
    if rh in ('arp', 'guitar', 'arp16'):
        step = {'arp': 0.25, 'guitar': 0.5, 'arp16': 0.25}[rh]
        for bar in range(S.bars):
            r, q = S.chord(bar)
            notes = voicing(r, q, 60 if rh != 'guitar' else 52, 82)
            seq = notes + notes[-2:0:-1] if rh != 'arp16' else notes + [n + 12 for n in notes]
            for k in range(int(4 / step)):
                m = seq[k % len(seq)]
                S.add('chords', S.t(bar, k * step), INSTR[instr](hz(m), step * S.beat * 0.9, 0.8))
    else:
        base = {'organ': 50, 'pad': 52, 'piano': 55, 'pizz': 50}.get(instr, 55)
        chords_part(S, instr, rhythms[rh], lambda b: True, base)
    if z.get('pad'):
        chords_part(S, z['pad'], lambda bar: [(0, 4)], lambda b: sec(b) != 'A' or b >= 8, 52, 0.8)
    if z.get('stabs'):
        for bar in range(S.bars):
            if sec(bar) == 'B' and bar % 2 == 1:
                r, q = S.chord(bar)
                for m in voicing(r, q, 60, 79):
                    S.add('lead', S.t(bar, 3.5), i_brass_stab(hz(m), 0.18), 0.8)
    if z.get('lead'):
        instr_l, scale, dens = z['lead']
        lo, hi = (72, 91) if instr_l in ('bell', 'square', 'pluck') else (62, 81)
        melody_part(S, instr_l, scale, lambda b: sec(b) == 'B', lo, hi, dens, motif_bars=2 if dens > 0.3 else 4, rest=0.25 if dens > 0.3 else 0.55)
    if z.get('slide'):
        melody_part(S, 'slide', 'penta', lambda b: sec(b) == 'C', 57, 72, 0.3, bus='lead', motif_bars=4, rest=0.5)
    # Ambience.
    fx = z.get('fx', [])
    n = S.n
    if 'crackle' in fx:
        S.add('fx', 0, crackle(n, rng, 1.0))
    if 'wind' in fx:
        S.add('fx', 0, wind(n, rng, 1.2))
    if 'church' in fx:
        for bar in range(0, S.bars, 8):
            for k, m in enumerate([z['key'] + 72, z['key'] + 67, z['key'] + 70, z['key'] + 63]):
                S.add('fx', S.t(bar, k), i_bell(hz(m), 2.5), 0.5)
    if 'ticks' in fx:
        for bar in range(S.bars):
            if sec(bar) != 'C':
                for b in range(4):
                    S.add('fx', S.t(bar, b + 0.5), np.sin(2 * np.pi * 3200 * np.arange(int(0.01 * SR)) / SR) * np.exp(-np.arange(int(0.01 * SR)) / SR / 0.002), 0.08)
    if 'clanks' in fx:
        clanks(S, rng, int(S.length / 9))
    if 'train' in fx:
        horn_call(S, S.length * 0.37, 98, 3.0, 0.07)
        horn_call(S, S.length * 0.86, 104, 2.4, 0.06)
    if 'ferry' in fx:
        horn_call(S, S.length * 0.5, 82, 3.2, 0.08)
    if 'ship' in fx:
        horn_call(S, S.length * 0.62, 73, 3.5, 0.08)
    if 'gulls' in fx:
        gulls(S, rng, int(S.length / 14))
    if 'birds' in fx:
        chirps(S, rng, int(S.length / 7))
    if 'kalimba' in fx:
        melody_part(S, 'kalimba', 'majpenta', lambda b: sec(b) in ('A', 'C'), 72, 88, 0.5, bus='fx', motif_bars=2, rest=0.4, vel=0.7)
    if 'drips' in fx:
        drips(S, rng, 0.7)
    if 'scrapes' in fx:
        scrapes(S, rng, int(S.length / 18))
    if 'growl' in fx:
        for k in range(3):
            t0 = S.length * (0.2 + 0.3 * k)
            nn = int(1.6 * SR)
            tt = np.arange(nn) / SR
            g = lp(osc('saw', 46, nn) * (1 + 0.5 * rng.standard_normal(nn) * 0.3), 260) * np.sin(np.pi * tt / tt[-1])
            S.add('fx', t0, g, 0.12)
    if 'chains' in fx:
        chains(S, rng, [b for b in range(S.bars) if b % 8 == 7])

    # ---- mix
    def get(k):
        return S.bus.get(k, np.zeros(n))

    def st(sig, pan):
        return np.stack([sig * math.cos((pan + 1) * math.pi / 4), sig * math.sin((pan + 1) * math.pi / 4)], axis=1)

    drums_b = get('drums') + get('fxsnare')
    if z['drums'] == 'dub':
        drums_b = drums_b + echo(get('fxsnare'), S.beat * 0.75, 0.55, 2200) * 0.8
    lead = get('lead')
    if z['id'] in ('waterfront', 'rooftops', 'glass-district'):
        lead = lead + echo(lead, S.beat * 0.75, 0.4, 3000) * 0.5
    out = st(drums_b, 0.05) * 0.85 + st(get('bass'), 0) + st(get('chords'), -0.25) + st(lead, 0.3) + st(get('fx'), 0.15) * 0.9
    wet_amount = {'rooftops': 0.6, 'sewer-deep': 0.75, 'central-green': 0.35, 'sutton-row': 0.3, 'gutter-kings-hideout': 0.45}.get(z['id'], 0.25)
    send = get('chords') + lead * 0.8 + get('fx') * 0.6 + drums_b * 0.1
    wet = reverb(send, 1.6 if wet_amount > 0.5 else 1.0, 3500)
    out[:, 0] += wet * wet_amount
    out[:, 1] += np.roll(wet, int(0.011 * SR)) * wet_amount
    if z.get('radio'):
        for c in range(2):
            out[:, c] = bp(out[:, c], 180, 6000)
        out += np.stack([crackle(n, rng, 0.5)] * 2, axis=1)
    if z['id'] == 'sewer-deep':
        for c in range(2):
            out[:, c] = lp(out[:, c], 5000)
    # Fold the tail onto the start: a seamless loop.
    L = int(S.length * SR)
    loop = out[:L].copy()
    loop[: n - L] += out[L:]
    # Gentle bus compression (soft clip) and peak headroom; the loudness is set after measuring.
    loop = np.tanh(loop / max(1e-9, np.max(np.abs(loop))) * 1.4) / np.tanh(1.4) * 0.9
    return loop, S


def loudness(path):
    r = subprocess.run(['ffmpeg', '-hide_banner', '-i', path, '-af', 'loudnorm=I=-14:TP=-1:print_format=json', '-f', 'null', '-'], capture_output=True, text=True)
    js = r.stderr[r.stderr.rfind('{'):]
    return json.loads(js[: js.find('}') + 1])


def main():
    want = sys.argv[1:]
    for z in ZONES:
        if want and not any(w in z['id'] for w in want):
            continue
        loop, S = render(z)
        pcm = (np.clip(loop, -1, 1) * 32767).astype(np.int16)
        wav = f'/tmp/zone-{z["id"]}.wav'
        with wave.open(wav, 'wb') as w:
            w.setnchannels(2)
            w.setsampwidth(2)
            w.setframerate(SR)
            w.writeframes(pcm.tobytes())
        m = loudness(wav)
        gain = -14.0 - float(m['input_i'])
        # Keep the true peak at -1 dBTP at most.
        gain = min(gain, -1.0 - float(m['input_tp']))
        dest = os.path.join(ROOT, 'public', 'music', f'zone-{z["id"]}.mp3')
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav, '-af', f'volume={gain:.2f}dB', '-codec:a', 'libmp3lame', '-b:a', '192k', dest], check=True)
        print(f'{dest}: {S.length:.1f} s, {S.bars} bars at {S.bpm} bpm, measured {m["input_i"]} LUFS, gain {gain:+.1f} dB', file=sys.stderr)


if __name__ == '__main__':
    main()
