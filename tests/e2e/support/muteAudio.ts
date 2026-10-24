// 브라우저의 소리를 끈다 (헤드리스 테스트는 소리를 내지 않는다, 2026-10-24 저자 지시).
// 크로미움은 설정의 --mute-audio 로 꺼진다. WebKit 에는 그런 옵션이 없어, 웹 엔진(SDL2 의 Web Audio)이 쓰는 AudioContext 의
// destination 을 음량 0의 GainNode 로 바꾼다. 페이지가 열리기 전에 context.addInitScript(MUTE_AUDIO) 로 넣는다.

export const MUTE_AUDIO = () => {
  const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
  for (const name of ["AudioContext", "webkitAudioContext"] as const) {
    const Base = w[name];
    if (!Base) continue;
    const real = Object.getOwnPropertyDescriptor(BaseAudioContext.prototype, "destination") ?? Object.getOwnPropertyDescriptor(Base.prototype, "destination");
    if (!real?.get) continue;
    const muted = new WeakMap<object, GainNode>();
    Object.defineProperty(Base.prototype, "destination", {
      configurable: true,
      get(this: AudioContext) {
        let gain = muted.get(this);
        if (!gain) {
          gain = this.createGain();
          gain.gain.value = 0;
          gain.connect(real.get!.call(this) as AudioNode);
          muted.set(this, gain);
        }
        return gain;
      },
    });
  }
};
