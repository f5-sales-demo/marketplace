const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
async function test(devices, mismatch = false) {
  let called = 0,
    stopped = 0,
    last;
  const context = {
    window: {},
    HTMLMediaElement: { prototype: {} },
    navigator: {
      mediaDevices: {
        enumerateDevices: async () => devices,
        getUserMedia: async (c) => {
          called++;
          last = c;
          const tracks = Object.entries(c)
            .filter(([, v]) => v)
            .map(([kind, v]) => ({
              kind,
              label: 'virtual',
              readyState: 'live',
              enabled: true,
              getSettings: () => ({
                deviceId: mismatch ? 'wrong' : v.deviceId.exact,
                width: 1280,
                height: 720,
                frameRate: 30,
              }),
              stop: () => stopped++,
            }));
          return {
            getTracks: () => tracks,
            getVideoTracks: () => tracks.filter((t) => t.kind === 'video'),
            getAudioTracks: () => tracks.filter((t) => t.kind === 'audio'),
          };
        },
      },
    },
  };
  vm.runInNewContext(
    fs.readFileSync(require('node:path').join(__dirname, '..', 'virtual-media-guard.js'), 'utf8'),
    context,
  );
  return { media: context.navigator.mediaDevices, values: () => ({ called, stopped, last }) };
}
(async () => {
  const devices = [
    { kind: 'videoinput', label: 'xcsh Camera', deviceId: 'v' },
    { kind: 'audioinput', label: 'xcsh_zoom_microphone', deviceId: 'a' },
    { kind: 'videoinput', label: 'physical', deviceId: 'p' },
  ];
  let t = await test(devices);
  await t.media.getUserMedia({ video: { deviceId: 'p' }, audio: true });
  assert.equal(t.values().last.video.deviceId.exact, 'v');
  assert.equal(t.values().last.audio.deviceId.exact, 'a');
  assert.equal((await t.media.enumerateDevices()).length, 2);
  t = await test(devices.filter((d) => d.label !== 'xcsh Camera'));
  await assert.rejects(() => t.media.getUserMedia({ video: true }));
  assert.equal(t.values().called, 0);
  t = await test(devices, true);
  await assert.rejects(() => t.media.getUserMedia({ video: true }));
  assert.equal(t.values().stopped, 1);
  console.log(
    'Virtual media guard: forced virtual IDs, physical exclusion, missing device rejection and mismatch stop passed',
  );
})();
