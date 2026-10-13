#!/usr/bin/env python3
"""
Render Digimon World Dusk music (SSEQ) and sound effects (SSAR) to OGG with the game's own
instrument banks (SBNK) and samples (SWAR), straight from your ROM, into a local, gitignored pack.

    pip install ndspy numpy      (and ffmpeg on PATH)
    python3 tools/rom-extract/dusk_sound.py "Digimon World - Dusk (USA).nds" [--seconds 75]

Writes public/assets/packs/sound/dusk/{bgm00..,se000..}.ogg and sound.json (ids, lengths).

This is a compact software take on the DS sequencer: notes/rests/ties, tempo, track volume,
expression, pan, transpose, pitch bend, ADSR, loops, calls/jumps, mono/poly note-wait,
PCM8/PCM16/IMA-ADPCM samples, PSG square and noise. Vibrato, portamento, sweep and
variables/random/if are ignored. Music renders up to --seconds with a fade-out.
"""
import io, json, math, os, struct, subprocess, sys, tempfile, wave
import numpy as np
import ndspy.rom
import ndspy.soundArchive as sa
from packs import ROOT

RATE = 32000
OUT = os.path.join(ROOT, 'sound', 'dusk')

# ---------------------------------------------------------------- samples
IMA_STEP = [7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 19, 21, 23, 25, 28, 31, 34, 37, 41, 45, 50, 55, 60, 66, 73, 80, 88, 97,
            107, 118, 130, 143, 157, 173, 190, 209, 230, 253, 279, 307, 337, 371, 408, 449, 494, 544, 598, 658, 724, 796,
            876, 963, 1060, 1166, 1282, 1411, 1552, 1707, 1878, 2066, 2272, 2499, 2749, 3024, 3327, 3660, 4026, 4428,
            4871, 5358, 5894, 6484, 7132, 7845, 8630, 9493, 10442, 11487, 12635, 13899, 15289, 16818, 18500, 20350,
            22385, 24623, 27086, 29794, 32767]
IMA_IDX = [-1, -1, -1, -1, 2, 4, 6, 8]


def decode_wave(w):
    """-> (float32 samples, loop_start or None, sample_rate)"""
    d = bytes(w.data)
    if w.waveType == 0:      # PCM8
        s = np.frombuffer(d, np.int8).astype(np.float32) / 128
        ls = w.loopOffset * 4
    elif w.waveType == 1:    # PCM16
        s = np.frombuffer(d[:len(d) // 2 * 2], '<i2').astype(np.float32) / 32768
        ls = w.loopOffset * 2
    else:                    # IMA-ADPCM with 4-byte header
        pred, idx = struct.unpack_from('<hH', d, 0)
        idx = min(idx, 88)
        out = np.empty((len(d) - 4) * 2, np.float32)
        k = 0
        for b in d[4:]:
            for n in (b & 15, b >> 4):
                step = IMA_STEP[idx]
                diff = step >> 3
                if n & 1: diff += step >> 2
                if n & 2: diff += step >> 1
                if n & 4: diff += step
                pred = max(-32768, min(32767, pred - diff if n & 8 else pred + diff))
                idx = max(0, min(88, idx + IMA_IDX[n & 7]))
                out[k] = pred / 32768; k += 1
        s = out
        ls = max(0, (w.loopOffset - 1) * 8)
    return s, (ls if w.isLooped and ls < len(s) - 4 else None), w.sampleRate


# ---------------------------------------------------------------- synthesis helpers
def att_time(a): return ((127 - a) / 127) ** 2 * 0.8
def dec_time(d): return ((127 - d) / 127) ** 2 * 2.5 + 0.005
def rel_time(r): return ((127 - r) / 127) ** 2 * 3.0 + 0.01
def lvl(v): return (max(0, v) / 127) ** 2


def envelope(n_on, n_total, nd):
    t = np.arange(n_total) / RATE
    a, d, s = att_time(nd.attack), dec_time(nd.decay), lvl(nd.sustain)
    env = np.where(t < a, t / max(a, 1e-4), np.maximum(s, 1 - (t - a) / d * (1 - s)))
    if n_on < n_total:
        level_at_off = env[n_on - 1] if n_on > 0 else 0
        r = rel_time(nd.release)
        rt = (np.arange(n_total - n_on) / RATE)
        env[n_on:] = level_at_off * np.maximum(0, 1 - rt / r)
    return env


class Synth:
    def __init__(self, sdat):
        self.sdat = sdat
        self.cache = {}

    def wave(self, bank, nd):
        swar_id = bank.waveArchiveIDs[nd.waveArchiveIDID]
        key = (swar_id, nd.waveID)
        if key not in self.cache:
            swar = self.sdat.waveArchives[swar_id][1]
            self.cache[key] = decode_wave(swar.waves[nd.waveID]) if swar and nd.waveID < len(swar.waves) else None
        return self.cache[key]

    def note_def(self, inst, key):
        t = type(inst).__name__
        if t == 'SingleNoteInstrument':
            return inst.noteDefinition
        if t == 'RangeInstrument':
            i = key - inst.firstPitch
            return inst.noteDefinitions[i] if 0 <= i < len(inst.noteDefinitions) else None
        if t == 'RegionalInstrument':
            for r in inst.regions:
                if key <= r.lastPitch:
                    return r.noteDefinition
        return None

    def render_note(self, bank, prog, key, semis, dur_s, amp):
        if prog >= len(bank.instruments) or bank.instruments[prog] is None:
            return None, 64
        nd = self.note_def(bank.instruments[prog], key)
        if nd is None:
            return None, 64
        typ = int(nd.type)
        if dur_s is None:            # duration 0 = play the sample through once (capped for loops/PSG)
            w = self.wave(bank, nd) if typ == 1 else None
            if w is not None and w[1] is None:
                dur_s = (len(w[0]) / w[2]) / 2 ** ((key + semis - nd.pitch) / 12)
            else:
                dur_s = 1.0
        n_on = max(1, int(dur_s * RATE))
        n_total = n_on + int(rel_time(nd.release) * RATE)
        if typ == 1:                                   # PCM sample
            w = self.wave(bank, nd)
            if w is None:
                return None, nd.pan
            s, loop, sr = w
            step = sr / RATE * 2 ** ((key + semis - nd.pitch) / 12)
            pos = np.arange(n_total) * step
            if loop is None:
                n_total = min(n_total, int((len(s) - 1) / step))
                if n_total <= 0:
                    return None, nd.pan
                pos = pos[:n_total]; n_on = min(n_on, n_total)
            else:
                L = len(s) - 1 - loop
                over = pos > loop
                pos[over] = loop + np.mod(pos[over] - loop, max(L, 1))
            i = pos.astype(np.int64); f = pos - i
            sig = s[i] * (1 - f) + s[np.minimum(i + 1, len(s) - 1)] * f
        elif typ == 2:                                 # PSG square
            freq = 440 * 2 ** ((key + semis - 69) / 12)
            duty = (nd.dutyCycle % 8 + 1) / 8
            sig = np.where(np.mod(np.arange(n_total) * freq / RATE, 1) < duty, 0.5, -0.5).astype(np.float32)
        elif typ == 3:                                 # noise
            sig = (np.random.rand(n_total).astype(np.float32) - 0.5)
        else:
            return None, nd.pan
        return sig * envelope(n_on, n_total, nd) * amp, nd.pan


# ---------------------------------------------------------------- sequencer
def varlen(d, p):
    v = 0
    while True:
        b = d[p]; p += 1
        v = (v << 7) | (b & 0x7f)
        if not b & 0x80:
            return v, p


def run_track(d, start, max_ticks):
    """Interpret one track; returns (events list, tempo changes) where events are
    (tick, key, velocity, dur_ticks, state snapshot)."""
    notes, tempos = [], []
    p, tick = start, 0
    st = dict(prog=0, vol=127, expr=127, pan=64, transpose=0, bend=0, bendrange=2, wait=True,
              attack=None, decay=None, sustain=None, release=None)
    calls, loops, guard = [], [], 0
    while p < len(d) and tick < max_ticks and guard < 200000:
        guard += 1
        c = d[p]; p += 1
        if c < 0x80:
            vel = d[p]; p += 1
            dur, p = varlen(d, p)
            notes.append((tick, c + st['transpose'], vel, dur, dict(st)))
            if st['wait']:
                tick += dur
        elif c == 0x80:
            v, p = varlen(d, p); tick += v
        elif c == 0x81:
            v, p = varlen(d, p); st['prog'] = v
        elif c == 0x93:
            p += 4                                       # open track: handled by caller
        elif c == 0x94:
            tgt = d[p] | d[p + 1] << 8 | d[p + 2] << 16
            if tgt < p:                                  # backwards jump = song loop: keep looping until max_ticks
                pass
            p = tgt
        elif c == 0x95:
            calls.append(p + 3); p = d[p] | d[p + 1] << 8 | d[p + 2] << 16
        elif c == 0xFD:
            if not calls: break
            p = calls.pop()
        elif c == 0xD4:
            loops.append([p + 1, d[p]]); p += 1
        elif c == 0xFC:
            if loops:
                lp = loops[-1]
                if lp[1] == 0:                           # infinite loop
                    p = lp[0]
                else:
                    lp[1] -= 1
                    if lp[1] > 0: p = lp[0]
                    else: loops.pop()
        elif c == 0xFF:
            break
        elif c == 0xFE:
            p += 2
        elif c == 0xE1:
            tempos.append((tick, struct.unpack_from('<h', d, p)[0])); p += 2
        elif c in (0xE0, 0xE3):
            p += 2
        elif 0xB0 <= c <= 0xBD:
            p += 3
        elif c == 0xA0:                                  # random: cmd + its args (minus last) + s16 min/max
            sub = d[p]; p += 1
            p += (1 if sub < 0x80 else 0) + 4            # note: velocity byte; most others: no extra
        elif c == 0xA1:
            sub = d[p]; p += 1
            p += (1 if sub < 0x80 else 0) + 1
        elif c == 0xA2:
            pass                                         # 'if': treat the next command as taken
        elif 0xC0 <= c <= 0xD6:
            v = d[p]; p += 1
            sv = v - 256 if v > 127 else v
            if c == 0xC0: st['pan'] = v
            elif c == 0xC1: st['vol'] = v
            elif c == 0xC3: st['transpose'] = sv
            elif c == 0xC4: st['bend'] = sv
            elif c == 0xC5: st['bendrange'] = v
            elif c == 0xC7: st['wait'] = v == 1
            elif c == 0xD0: st['attack'] = v
            elif c == 0xD1: st['decay'] = v
            elif c == 0xD2: st['sustain'] = v
            elif c == 0xD3: st['release'] = v
            elif c == 0xD5: st['expr'] = v
        else:
            break                                        # unknown command: stop this track
    return notes, tempos


def tracks_of(d, start):
    """Track 0 begins at start; 0xFE + 0x93 opens at the head list the other tracks."""
    starts, p = [start], start
    if d[p] == 0xFE:
        p += 3
    while p + 4 < len(d) and d[p] == 0x93:
        starts.append(d[p + 2] | d[p + 3] << 8 | d[p + 4] << 16)
        p += 5
    return starts, p


def render(synth, bank, d, start, seconds, master=1.0):
    max_ticks = int(seconds * 240 * 0.8)                 # generous upper bound in ticks
    starts, head_end = tracks_of(d, start)
    all_notes, tempos = [], [(0, 120)]
    for i, s0 in enumerate(starts):
        n, t = run_track(d, head_end if i == 0 else s0, max_ticks)
        all_notes += n; tempos += t
    tempos.sort()

    def t2s(tick):                                       # piecewise tempo map, 1 tick = 1/(tempo*0.8) s
        sec, last_t, last_bpm = 0.0, 0, 120
        for tt, bpm in tempos:
            if tt > tick: break
            sec += (tt - last_t) / (last_bpm * 0.8); last_t, last_bpm = tt, max(bpm, 1)
        return sec + (tick - last_t) / (last_bpm * 0.8)

    total = int(seconds * RATE) + RATE * 3
    mix = np.zeros((2, total), np.float32)
    for tick, key, vel, dur, st in all_notes:
        t0 = t2s(tick)
        if t0 >= seconds: continue
        dur_s = None if dur == 0 else max(0.02, t2s(tick + dur) - t0)
        semis = st['bend'] / 127 * st['bendrange']
        amp = lvl(vel) * lvl(st['vol']) * lvl(st['expr']) * master
        sig, npan = synth.render_note(bank, st['prog'], key, semis, dur_s, amp)
        if sig is None: continue
        pan = max(0, min(127, st['pan'] + npan - 64)) / 127
        a = int(t0 * RATE); b = min(total, a + len(sig))
        mix[0, a:b] += sig[:b - a] * math.cos(pan * math.pi / 2)
        mix[1, a:b] += sig[:b - a] * math.sin(pan * math.pi / 2)
    end = np.max(np.nonzero(np.abs(mix).sum(0) > 1e-4)[0], initial=0) + 1
    mix = mix[:, :min(end, total)]
    if mix.shape[1] > seconds * RATE * 0.95:             # looping track: fade out the tail
        n = min(mix.shape[1], RATE * 4)
        mix[:, -n:] *= np.linspace(1, 0, n)
    peak = np.abs(mix).max() or 1
    return mix * min(1.0, 0.89 / peak) if peak > 0.89 else mix


def save_ogg(mix, path):
    pcm = (np.clip(mix.T, -1, 1) * 32767).astype('<i2').tobytes()
    with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as f:
        w = wave.open(f, 'wb'); w.setnchannels(2); w.setsampwidth(2); w.setframerate(RATE); w.writeframes(pcm); w.close()
        tmp = f.name
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', tmp, '-c:a', 'libvorbis', '-q:a', '3', path], check=True)
    os.unlink(tmp)


def main():
    rom = ndspy.rom.NintendoDSRom.fromFile(sys.argv[1])
    seconds = float(sys.argv[sys.argv.index('--seconds') + 1]) if '--seconds' in sys.argv else 75
    sdat = sa.SDAT(rom.getFileByName('dat/snd/sound_data.sdat'))
    synth = Synth(sdat)
    os.makedirs(OUT, exist_ok=True)
    out = {'bgm': [], 'se': []}
    for name, seq in sdat.sequences:
        if not seq: continue
        bank = sdat.banks[seq.bankID][1]
        mix = render(synth, bank, bytes(seq.eventsData), 0, seconds, seq.volume / 127)
        if mix.shape[1] < RATE: continue
        save_ogg(mix, os.path.join(OUT, f'{name}.ogg'))
        out['bgm'].append({'id': name, 'seconds': round(mix.shape[1] / RATE, 1)})
        print(name, round(mix.shape[1] / RATE, 1), 's')
    ssar = sdat.sequenceArchives[0][1]
    data = bytes(ssar.eventsData)
    for name, s in ssar.sequences:
        if not s: continue
        bank = sdat.banks[s.bankID][1]
        try:
            mix = render(synth, bank, data, s.firstEventOffset, 6, s.volume / 127)
        except Exception as ex:
            print(name, 'skipped', ex); continue
        if mix.shape[1] < RATE // 50: continue
        save_ogg(mix, os.path.join(OUT, f'{name}.ogg'))
        out['se'].append({'id': name, 'seconds': round(mix.shape[1] / RATE, 2)})
    json.dump(out, open(os.path.join(OUT, 'sound.json'), 'w'), indent=1)
    print(len(out['bgm']), 'songs,', len(out['se']), 'sound effects ->', OUT)


if __name__ == '__main__':
    main()
