"""Original continuous electronic score, synchronized to visible product events."""
from pathlib import Path
import numpy as np
import wave
sr=48000
seconds=30
n=sr*seconds
t=np.arange(n)/sr
rng=np.random.default_rng(42)
score=np.zeros(n)
# One pulse throughout; timbre and density carry three movement peaks.
bpm=104
beat=60/bpm
peaks=[(187/30,221/30),(531/30,565/30),(747/30,782/30)]
energy=np.ones(n)
for a,b in peaks:
 mask=(t>=a)&(t<b)
 energy[mask]=.68
for k,at in enumerate(np.arange(0,seconds,beat)):
 start=int(at*sr);length=min(int(.31*sr),n-start);u=np.arange(length)/sr
 kick=np.sin(2*np.pi*(48*u+27*(1-np.exp(-u*28))/28))*np.exp(-u*15)
 score[start:start+length]+=kick*.19
# Bass motif, C minor; gently syncopated, no item-by-item chimes.
roots=[65.406,51.913,77.782,58.270]
for k,at in enumerate(np.arange(0,seconds,beat/2)):
 if k%8 in (1,3,6):continue
 start=int(at*sr);length=min(int(beat*.63*sr),n-start);u=np.arange(length)/sr
 hz=roots[(k//16)%4]*(2 if k%8==5 else 1)
 env=np.minimum(u/.012,1)*np.exp(-u*6)
 bass=(np.sin(2*np.pi*hz*u)+.17*np.sin(2*np.pi*2*hz*u)+.055*np.sin(2*np.pi*3*hz*u))*env
 score[start:start+length]+=bass*.115
# Wide warm harmonic bed follows the same progression.
pad=np.zeros(n)
chords=[[130.813,155.563,195.998],[103.826,130.813,155.563],[155.563,195.998,233.082],[116.541,146.832,174.614]]
for k,at in enumerate(np.arange(0,seconds,beat*8)):
 start=int(at*sr);length=min(int(beat*8*sr),n-start);u=np.arange(length)/sr
 env=np.minimum(u/.55,1)*np.minimum((length/sr-u)/.5,1)
 for hz in chords[k%4]:pad[start:start+length]+=np.sin(2*np.pi*hz*u)*env*.022
# Sparse hats sit inside the groove, never keyed to text or individual cards.
for k,at in enumerate(np.arange(beat/2,seconds,beat)):
 start=int(at*sr);length=min(int(.065*sr),n-start);u=np.arange(length)/sr
 noise=rng.standard_normal(length);noise=np.r_[0,np.diff(noise)]
 score[start:start+length]+=noise*np.exp(-u*65)*.014
# Three sweeps remain in the score's timbre family.
for a,b in peaks:
 start=int(a*sr);length=min(int((b-a)*sr),n-start);u=np.arange(length)/sr
 env=np.sin(np.pi*u/(length/sr))**2
 hz=350+850*(u/(length/sr))**2
 phase=np.cumsum(hz)*2*np.pi/sr
 score[start:start+length]+=(np.sin(phase)*.032+rng.standard_normal(length)*.009)*env
# Only five visible operation events receive a restrained low trigger.
for frame in [53,189,412,554,722]:
 start=int(frame/30*sr);length=min(int(.15*sr),n-start);u=np.arange(length)/sr
 score[start:start+length]+=np.sin(2*np.pi*(230*u-65*u*u))*np.exp(-u*29)*.045
left=(score*energy+pad)
right=(score*energy+np.roll(pad,410))
fade=np.minimum(t/.35,1)*np.minimum((seconds-t)/1.5,1)
audio=np.column_stack([left*fade,right*fade])
audio=np.tanh(audio)*.83
with wave.open('original-score.wav','wb') as wav:
 wav.setnchannels(2);wav.setsampwidth(2);wav.setframerate(sr);wav.writeframes((audio*32767).astype('<i2').tobytes())
print('Original score: 30s, 48kHz stereo; peak',np.max(np.abs(audio)))
