(function (global) {
  function WebAudioFontPlayer() {
    this.loader = {
      decodeAfterLoading: function () {}
    };
  }

  WebAudioFontPlayer.prototype.queueWaveTable = function (
    audioContext,
    destination,
    preset,
    when,
    midi,
    duration,
    velocity
  ) {
    var oscillator = audioContext.createOscillator();
    var gain = audioContext.createGain();
    var frequency = 440 * Math.pow(2, (midi - 69) / 12);
    var safeVelocity = Math.min(0.8, Math.max(0, velocity || 0));
    var presetGain = preset && preset.gain ? preset.gain : 0.34;

    oscillator.type = preset && preset.waveType ? preset.waveType : "sine";
    oscillator.frequency.setValueAtTime(frequency, when);
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(
      Math.max(0.0001, safeVelocity * presetGain),
      when + 0.012
    );
    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      when + Math.max(0.08, duration)
    );

    oscillator.connect(gain);
    gain.connect(destination);
    oscillator.start(when);
    oscillator.stop(when + Math.max(0.08, duration) + 0.05);
  };

  global.WebAudioFontPlayer = WebAudioFontPlayer;
})(window);
