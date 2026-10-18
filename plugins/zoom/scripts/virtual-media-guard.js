// Restrict the owned Zoom browser to explicitly named virtual media devices.
(() => {
  if (window.__piZoomMediaGuard) return;
  const media = navigator.mediaDevices;
  if (!media) throw new Error('Virtual media API unavailable');
  const enumerate = media.enumerateDevices.bind(media);
  const capture = media.getUserMedia.bind(media);
  const state = { version: 1, streams: [], requests: 0 };
  const allowed = (d) =>
    (d.kind === 'videoinput' && d.label === 'xcsh Camera') ||
    (d.kind === 'audioinput' && ['xcsh_Zoom_Microphone', 'xcsh_zoom_microphone'].includes(d.label)) ||
    (d.kind === 'audiooutput' && d.label === 'xcsh_zoom_output');
  const inventory = async () => (await enumerate()).filter(allowed);
  const choose = (devices, kind) => {
    const rows = devices.filter((d) => d.kind === kind);
    if (rows.length !== 1 || !rows[0].deviceId) throw new Error('Required virtual device is unavailable or ambiguous');
    return rows[0];
  };
  media.enumerateDevices = inventory;
  media.getUserMedia = async (requested) => {
    const devices = await inventory();
    const selected = {};
    const expected = {};
    for (const [key, kind] of [
      ['video', 'videoinput'],
      ['audio', 'audioinput'],
    ]) {
      if (!requested?.[key]) {
        selected[key] = false;
        continue;
      }
      const device = choose(devices, kind);
      expected[key] = device.deviceId;
      selected[key] = { deviceId: { exact: device.deviceId } };
      if (key === 'video')
        Object.assign(selected[key], {
          width: { exact: 1280 },
          height: { exact: 720 },
          frameRate: { exact: 30 },
        });
    }
    if (!selected.audio && !selected.video) throw new Error('Explicit virtual media request required');
    const stream = await capture(selected);
    try {
      for (const key of Object.keys(expected)) {
        const tracks = key === 'video' ? stream.getVideoTracks() : stream.getAudioTracks();
        if (tracks.length !== 1 || tracks[0].getSettings().deviceId !== expected[key])
          throw new Error('Captured device differs from required virtual device');
        if (key === 'video') {
          const settings = tracks[0].getSettings();
          if (settings.width !== 1280 || settings.height !== 720 || settings.frameRate !== 30)
            throw new Error('Virtual camera profile differs from 720p30');
        }
      }
    } catch (error) {
      stream.getTracks().forEach((track) => {
        track.stop();
      });
      throw error;
    }
    state.requests += 1;
    state.streams.push(stream);
    return stream;
  };
  if (HTMLMediaElement.prototype.setSinkId) {
    const setSink = HTMLMediaElement.prototype.setSinkId;
    HTMLMediaElement.prototype.setSinkId = async function () {
      const output = choose(await inventory(), 'audiooutput');
      return setSink.call(this, output.deviceId);
    };
  }
  window.__piZoomMediaGuard = {
    version: state.version,
    inventory: async () => (await inventory()).map((d) => ({ kind: d.kind, label: d.label })),
    status: () => ({
      version: state.version,
      requests: state.requests,
      tracks: state.streams
        .flatMap((s) => s.getTracks())
        .map((t) => {
          const settings = t.getSettings();
          return {
            kind: t.kind,
            label: t.label,
            state: t.readyState,
            enabled: t.enabled,
            width: settings.width,
            height: settings.height,
            fps: settings.frameRate,
          };
        }),
    }),
  };
})();
