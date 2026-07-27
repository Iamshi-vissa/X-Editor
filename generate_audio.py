import wave
import struct
import math
import random
import os

def generate_wav(filename, duration, sample_rate=44100, func=None):
    n_samples = int(duration * sample_rate)
    with wave.open(filename, 'w') as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        for i in range(n_samples):
            t = float(i) / sample_rate
            val = func(t, i)
            # Clip
            val = max(-1.0, min(1.0, val))
            # Convert to 16-bit
            wav_file.writeframesraw(struct.pack('<h', int(val * 32767.0)))

# Shoot (white noise with fast decay)
generate_wav(r'D:\Users\bhara\Downloads\Void_Voyager_CPP\assets\shoot.wav', 0.15, func=lambda t, i: random.uniform(-1, 1) * math.exp(-30 * t))

# Pickup (two high notes)
def pickup_func(t, i):
    freq = 880 if t < 0.1 else 1320
    return math.sin(2 * math.pi * freq * t) * math.exp(-15 * (t % 0.1)) * 0.5
generate_wav(r'D:\Users\bhara\Downloads\Void_Voyager_CPP\assets\pickup.wav', 0.2, func=pickup_func)

# BGM (Low drone)
def bgm_func(t, i):
    f1 = 55.0 + math.sin(t * 0.5) * 5.0
    f2 = 110.0 + math.sin(t * 0.3) * 10.0
    val = math.sin(2 * math.pi * f1 * t) * 0.3 + math.sin(2 * math.pi * f2 * t) * 0.2
    return val * 0.5
generate_wav(r'D:\Users\bhara\Downloads\Void_Voyager_CPP\assets\bgm.wav', 10.0, func=bgm_func)
