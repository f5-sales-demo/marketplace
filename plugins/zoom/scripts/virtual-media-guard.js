// Restrict the owned Zoom browser to explicitly named virtual media devices.
(() => {
  if (window.__piZoomMediaGuard) return;
  const media = navigator.mediaDevices;
  if (!media) throw new Error('Virtual media API unavailable');
  const enumerate = media.enumerateDevices.bind(media);
  const capture = media.getUserMedia.bind(media);
  const profile = window.__piZoomCameraProfile || { width: 1280, height: 720, fps: 30 };
  let cameraReady = !window.__piZoomCameraProfile?.output;
  const state = { version: 1, streams: [], requests: 0, peers: [] };
  const Peer = window.RTCPeerConnection;
  if (Peer) {
    window.RTCPeerConnection = new Proxy(Peer, {
      construct(target, args) {
        const peer = Reflect.construct(target, args);
        state.peers.push(peer);
        return peer;
      },
    });
  }
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
    if (requested?.video && !cameraReady) throw new Error('Dedicated camera capture is not ready');
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
          width: { exact: profile.width },
          height: { exact: profile.height },
          frameRate: { exact: profile.fps },
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
          if (!cameraReady || settings.width !== profile.width || settings.height !== profile.height || settings.frameRate !== profile.fps)
            throw new Error('Virtual camera profile differs from the producer profile');
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
  // Wayland desktop audio capture is unavailable here. Meeting audio remains
  // on the explicitly selected virtual microphone, independent of screen share.
  if (media.getDisplayMedia) {
    const displayCapture = media.getDisplayMedia.bind(media);
    media.getDisplayMedia = (requested) => displayCapture({ ...requested, audio: false });
  }
  if (HTMLMediaElement.prototype.setSinkId) {
    const setSink = HTMLMediaElement.prototype.setSinkId;
    HTMLMediaElement.prototype.setSinkId = async function () {
      const output = choose(await inventory(), 'audiooutput');
      return setSink.call(this, output.deviceId);
    };
  }
  window.__piZoomMediaGuard = {
    version: state.version,
    setCameraReady: (ready) => {
      cameraReady = ready === true;
      if (!cameraReady) state.streams.flatMap((s) => s.getVideoTracks()).forEach((t) => t.stop());
    },
    inventory: async () => (await inventory()).map((d) => ({ kind: d.kind, label: d.label })),
    stats: async () => {
      const rows = [];
      for (const peer of state.peers) {
        const report = await peer.getStats();
        for (const value of report.values()) {
          if (value.type === 'outbound-rtp' && (value.kind === 'video' || value.mediaType === 'video')) {
            rows.push({
              width: value.frameWidth,
              height: value.frameHeight,
              fps: value.framesPerSecond,
              framesSent: value.framesSent,
              qualityLimitationReason: value.qualityLimitationReason,
              bytesSent: value.bytesSent,
              codec: report.get(value.codecId)?.mimeType,
            });
          }
        }
      }
      return rows;
    },
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
